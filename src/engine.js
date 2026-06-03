import { fetchCloudInventory, insertCloudProduct, deleteCloudProduct, updateCloudProductStock, resetCloudDatabaseBaseline, saveUserRoleToken, loadUserRoleToken } from './storage.js';

let inventory = [];
let currentRole = "Admin";

// BUSINESS LOGIC SECURITY RULE CHECKER MATRIX (RBAC ENGINE)
export const PERMISSIONS = {
    DELETE_PRODUCT: ["Admin"],
    ADD_PRODUCT: ["Admin"],
    MODIFY_STOCK: ["Admin", "Manager"],
    RESET_DATABASE: ["Admin"],
    SIMULATE_SALE: ["Admin", "Manager"]
};

export function setUserRole(role) {
    currentRole = role;
    saveUserRoleToken(role);
}

export function getUserRole() {
    return currentRole;
}

export function hasPermission(action) {
    return PERMISSIONS[action].includes(currentRole);
}

export function createProductObject(title, sku, price, stock, category) {
    return {
        title,
        sku,
        price: parseFloat(price) || 0,
        stock: parseInt(stock) || 0,
        category
    };
}

export async function syncAndInitializeInventory() {
    currentRole = loadUserRoleToken(); 
    inventory = await fetchCloudInventory();
    return inventory;
}

export function getInventory() {
    return inventory;
}

export async function addProduct(title, sku, price, stock, category) {
    if (!hasPermission("ADD_PRODUCT")) return inventory;
    
    const newProduct = createProductObject(title, sku, price, stock, category);
    await insertCloudProduct(newProduct);
    
    inventory = await fetchCloudInventory();
    return inventory;
}

export async function deleteProduct(productId) {
    if (!hasPermission("DELETE_PRODUCT")) return inventory;
    
    await deleteCloudProduct(productId);
    inventory = await fetchCloudInventory();
    return inventory;
}

export async function incrementStock(productId) {
    if (!hasPermission("MODIFY_STOCK")) return inventory;
    
    const product = inventory.find(p => p.id === productId);
    if (product) {
        const targetStock = product.stock + 1;
        await updateCloudProductStock(productId, targetStock);
        inventory = await fetchCloudInventory();
    }
    return inventory;
}

export async function decrementStock(productId) {
    if (!hasPermission("MODIFY_STOCK")) return inventory;
    
    const product = inventory.find(p => p.id === productId);
    if (product && product.stock > 0) {
        const targetStock = product.stock - 1;
        await updateCloudProductStock(productId, targetStock);
        inventory = await fetchCloudInventory();
    }
    return inventory;
}

export async function processProductSale(productId, sellQuantity) {
    if (!hasPermission("SIMULATE_SALE")) {
        alert("Security Flag: Your active session tier does not have Point-of-Sale clearance.");
        return inventory;
    }
    
    const product = inventory.find(p => p.id === productId);
    if (!product) return inventory;
    
    if (product.stock < sellQuantity) {
        alert(`Transaction Blocked: Deficient stock. Cannot sell ${sellQuantity} items when only ${product.stock} remain.`);
        return inventory;
    }
    
    const targetStock = product.stock - parseInt(sellQuantity);
    await updateCloudProductStock(productId, targetStock);
    
    inventory = await fetchCloudInventory();
    return inventory;
}

export async function resetInventoryToDefault() {
    if (!hasPermission("RESET_DATABASE")) return inventory;
    
    const baselineSeedData = [
        { title: "StadiumView Pro Projector", sku: "PROJ-HD-01", price: 299.99, stock: 15, category: "Home Cinema" },
        { title: "Nexura Ambient Light Strip", sku: "LED-RGB-04", price: 24.50, stock: 45, category: "Electronics" },
        { title: "Aurexa Soundbar Matrix", sku: "AUDIO-SB-09", price: 119.00, stock: 5, category: "Audio" }
    ];

    await resetCloudDatabaseBaseline(baselineSeedData);
    inventory = await fetchCloudInventory();
    return inventory;
}

export function calculateBusinessMetrics() {
    const totalSKUs = inventory.length;
    const totalValue = inventory.reduce((sum, p) => sum + (p.price * p.stock), 0);
    const lowStockAlertsCount = inventory.filter(p => p.stock < 10).length;

    const categoryValuations = { "Electronics": 0, "Home Cinema": 0, "Audio": 0 };
    inventory.forEach(p => {
        if (categoryValuations[p.category] !== undefined) {
            categoryValuations[p.category] += (p.price * p.stock);
        }
    });

    return { totalSKUs, totalValue, lowStockAlertsCount, categoryValuations };
}

export function generateInventoryCSVContent() {
    if (inventory.length === 0) return null;
    const csvHeaders = ["ID", "Product Title", "SKU", "Category", "Price ($)", "Stock Level (Qty)", "Total Valuation ($)"];
    const csvRows = inventory.map(p => [p.id, `"${p.title.replace(/"/g, '""')}"`, p.sku, p.category, p.price.toFixed(2), p.stock, (p.price * p.stock).toFixed(2)]);
    return [csvHeaders.join(","), ...csvRows.map(row => row.join(","))].join("\n");
}