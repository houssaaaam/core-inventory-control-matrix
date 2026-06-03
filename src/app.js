import { syncAndInitializeInventory, addProduct, deleteProduct, incrementStock, decrementStock, resetInventoryToDefault, calculateBusinessMetrics, generateInventoryCSVContent, setUserRole, getUserRole, hasPermission, processProductSale } from './engine.js';
import { renderDashboardMetrics, renderProductList, updateSystemStatusMessage } from './ui.js';
import { supabase } from './storage.js'; 

let trackingSortColumn = "title";
let trackingSortDirection = "asc";
let selectedProductIds = new Set(); 
let runningModalUnitPrice = 0;

async function refreshApplicationState() {
    try {
        const activeInventory = await syncAndInitializeInventory(); 
        const currentRole = getUserRole();
        
        const financialMetrics = calculateBusinessMetrics();
        
        // 1. DYNAMICALLY EXTRACT UNIQUE CATEGORIES FROM CURRENT DATABASE ITEMS
        // If the database is completely empty, it falls back to a clean baseline array
        const uniqueCategories = activeInventory.length > 0 
            ? [...new Set(activeInventory.map(item => item.category).filter(Boolean))]
            : ["Home Cinema", "Electronics", "Audio"];

        // 2. DYNAMICALLY RE-POPULATE THE SEARCH FILTER DROPDOWN
        const filterCategoryDropdown = document.getElementById("filter-category");
        if (filterCategoryDropdown) {
            const previouslySelected = filterCategoryDropdown.value;
            
            let dropdownHtml = `<option value="All">All Categories</option>`;
            uniqueCategories.forEach(cat => {
                dropdownHtml += `<option value="${cat}">${cat}</option>`;
            });
            filterCategoryDropdown.innerHTML = dropdownHtml;
            
            // Retain the user's current active filter selection if it still exists
            if (uniqueCategories.includes(previouslySelected) || previouslySelected === "All") {
                filterCategoryDropdown.value = previouslySelected;
            }
        }

        // 3. DYNAMICALLY RE-POPULATE INPUT DATALIST SUGGESTIONS FOR THE CREATION FORM
        const formDatalist = document.getElementById("category-suggestions");
        if (formDatalist) {
            formDatalist.innerHTML = uniqueCategories.map(cat => `<option value="${cat}"></option>`).join("");
        }

        // 4. CONTINUE METRIC RENDERING PASSING ALL DETECTED CATEGORIES
        renderDashboardMetrics(financialMetrics, currentRole, hasPermission, uniqueCategories);
        updateSystemStatusMessage(activeInventory.length);

        const searchElement = document.getElementById("search-input");
        const categoryElement = document.getElementById("filter-category");
        const lowStockCheckbox = document.getElementById("filter-low-stock");
        
        const searchQuery = searchElement ? searchElement.value.toLowerCase().trim() : "";
        const selectedCategory = categoryElement ? categoryElement.value : "All";
        const filterLowStockOnly = lowStockCheckbox ? lowStockCheckbox.checked : false;

        let filteredInventory = (activeInventory || []).filter(product => {
            if (!product) return false;
            const titleMatch = product.title ? product.title.toLowerCase().includes(searchQuery) : false;
            const skuMatch = product.sku ? product.sku.toLowerCase().includes(searchQuery) : false;
            const categoryMatch = selectedCategory === "All" || product.category === selectedCategory;
            const stockMatch = !filterLowStockOnly || product.stock < 10;
            
            return (titleMatch || skuMatch) && categoryMatch && stockMatch;
        });

        filteredInventory.sort((alpha, beta) => {
            let fieldA = alpha[trackingSortColumn];
            let fieldB = beta[trackingSortColumn];

            if (typeof fieldA === 'string') fieldA = fieldA.toLowerCase();
            if (typeof fieldB === 'string') fieldB = fieldB.toLowerCase();

            if (fieldA < fieldB) return trackingSortDirection === 'asc' ? -1 : 1;
            if (fieldA > fieldB) return trackingSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        renderProductList(
            filteredInventory, 
            currentRole, 
            hasPermission, 
            handleProductDeletion, 
            handleStockIncrement, 
            handleStockDecrement,
            { column: trackingSortColumn, direction: trackingSortDirection }
        );

        synchronizeCheckboxListeners(filteredInventory);

    } catch (renderError) {
        console.error("⚠️ UI Render Error Exception:", renderError.message);
    }
}

function synchronizeCheckboxListeners(renderedProducts) {
    const masterCheckbox = document.getElementById("master-select-checkbox");
    const rowCheckboxes = document.querySelectorAll(".row-select-checkbox");
    const batchBar = document.getElementById("batch-action-bar");
    const batchText = document.getElementById("batch-count-text");

    if (!masterCheckbox) return;

    masterCheckbox.onclick = (e) => {
        renderedProducts.forEach(p => {
            if (e.target.checked) selectedProductIds.add(p.id);
            else selectedProductIds.delete(p.id);
        });
        refreshApplicationState();
    };

    rowCheckboxes.forEach(box => {
        box.checked = selectedProductIds.has(box.dataset.id);
        box.onchange = (e) => {
            if (e.target.checked) selectedProductIds.add(box.dataset.id);
            else selectedProductIds.delete(box.dataset.id);
            updateBatchToolbarUI();
        };
    });

    function updateBatchToolbarUI() {
        if (selectedProductIds.size > 0) {
            if (batchBar) batchBar.style.display = "flex";
            if (batchText) batchText.textContent = `${selectedProductIds.size} items selected for batch action`;
        } else {
            if (batchBar) batchBar.style.display = "none";
        }
    }
    updateBatchToolbarUI();
}

async function executeBatchDeletion() {
    if (!hasPermission("DELETE_PRODUCT")) return;
    if (selectedProductIds.size === 0) return;

    if (confirm(`⚠️ Permanently delete all ${selectedProductIds.size} selected items across Supabase?`)) {
        document.getElementById("system-status").textContent = "Executing bulk drop operations on cloud...";
        
        const idsToDropArray = Array.from(selectedProductIds);
        const { error } = await supabase
            .from('inventory')
            .delete()
            .in('id', idsToDropArray);

        if (error) {
            alert("Bulk Delete Failed: " + error.message);
        } else {
            selectedProductIds.clear(); 
            await refreshApplicationState();
        }
    }
}

function handleHeaderSortToggle(event) {
    const clickedHeader = event.target.closest(".sortable-header");
    if (!clickedHeader) return;

    const targetedColumn = clickedHeader.dataset.column;
    if (trackingSortColumn === targetedColumn) {
        trackingSortDirection = trackingSortDirection === "asc" ? "desc" : "asc";
    } else {
        trackingSortColumn = targetedColumn;
        trackingSortDirection = "asc";
    }
    refreshApplicationState();
}

window.openCheckoutModal = function(product) {
    if (!hasPermission("SIMULATE_SALE")) {
        return alert("Access Denied: Your assigned access level profile does not possess checkout permissions.");
    }

    const modal = document.getElementById("checkout-modal");
    if (!modal) return;

    document.getElementById("modal-product-id").value = product.id;
    document.getElementById("modal-product-title").textContent = product.title;
    document.getElementById("modal-product-sku").textContent = `SKU: ${product.sku}`;
    document.getElementById("modal-available-stock").value = product.stock;
    document.getElementById("modal-unit-price").textContent = `$${parseFloat(product.price).toFixed(2)}`;
    
    const qtyInput = document.getElementById("modal-checkout-qty");
    qtyInput.value = 1;
    qtyInput.max = product.stock; 
    
    runningModalUnitPrice = parseFloat(product.price);
    updateLiveReceiptTotal(1);

    modal.style.display = "flex";
};

function closeCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    if (modal) modal.style.display = "none";
}

function updateLiveReceiptTotal(quantity) {
    const totalBox = document.getElementById("modal-total-cost");
    if (!totalBox) return;
    const computedTotal = runningModalUnitPrice * (parseInt(quantity) || 0);
    totalBox.textContent = `$${computedTotal.toFixed(2)}`;
}

async function handleCheckoutFormSubmission(event) {
    event.preventDefault();
    const productId = document.getElementById("modal-product-id").value;
    const sellQuantity = parseInt(document.getElementById("modal-checkout-qty").value) || 0;
    
    document.getElementById("system-status").textContent = "Processing secure checkout transaction...";
    await processProductSale(productId, sellQuantity);
    
    closeCheckoutModal();
    await refreshApplicationState();
}

async function handleProductSubmission(event) {
    event.preventDefault();
    if (!hasPermission("ADD_PRODUCT")) return;

    document.getElementById("system-status").textContent = "Writing transaction to cloud...";
    const title = document.getElementById("prod-title").value;
    const sku = document.getElementById("prod-sku").value;
    const price = document.getElementById("prod-price").value;
    const stock = document.getElementById("prod-stock").value;
    const category = document.getElementById("prod-category").value;

    await addProduct(title, sku, price, stock, category);
    await refreshApplicationState();
    if (document.getElementById("product-form")) document.getElementById("product-form").reset();
}

async function handleProductDeletion(productId) {
    if (!hasPermission("DELETE_PRODUCT")) return;
    await deleteProduct(productId);
    selectedProductIds.delete(productId); 
    await refreshApplicationState();
}

async function handleStockIncrement(productId) {
    if (!hasPermission("MODIFY_STOCK")) return;
    await incrementStock(productId);
    await refreshApplicationState();
}

async function handleStockDecrement(productId) {
    if (!hasPermission("MODIFY_STOCK")) return;
    await decrementStock(productId);
    await refreshApplicationState();
}

function startSystemPipeline() {
    console.log("🚀 [System Pipeline Core Active]: Mapping events...");
    
    if (document.getElementById("product-form")) document.getElementById("product-form").addEventListener("submit", handleProductSubmission);
    if (document.getElementById("search-input")) document.getElementById("search-input").addEventListener("input", refreshApplicationState);
    if (document.getElementById("filter-category")) document.getElementById("filter-category").addEventListener("change", refreshApplicationState);
    if (document.getElementById("filter-low-stock")) document.getElementById("filter-low-stock").addEventListener("change", refreshApplicationState);
    if (document.getElementById("batch-delete-btn")) document.getElementById("batch-delete-btn").addEventListener("click", executeBatchDeletion);
    
    if (document.getElementById("close-modal-btn")) document.getElementById("close-modal-btn").addEventListener("click", closeCheckoutModal);
    if (document.getElementById("checkout-form")) document.getElementById("checkout-form").addEventListener("submit", handleCheckoutFormSubmission);
    if (document.getElementById("modal-checkout-qty")) {
        document.getElementById("modal-checkout-qty").addEventListener("input", (e) => {
            updateLiveReceiptTotal(e.target.value);
        });
    }

    window.addEventListener("click", (e) => {
        const modal = document.getElementById("checkout-modal");
        if (e.target === modal) closeCheckoutModal();
    });

    if (document.getElementById("product-list-container")) {
        document.getElementById("product-list-container").addEventListener("click", handleHeaderSortToggle);
    }

    if (document.getElementById("csv-export-btn")) {
        document.getElementById("csv-export-btn").addEventListener("click", () => {
            const csvContent = generateInventoryCSVContent();
            if (!csvContent) return alert("Table empty.");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `export_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (document.getElementById("master-reset-btn")) {
        document.getElementById("master-reset-btn").addEventListener("click", async () => {
            if (confirm("Reset to default baseline arrays?")) {
                await resetInventoryToDefault();
                selectedProductIds.clear();
                await refreshApplicationState();
            }
        });
    }

    if (document.getElementById("auth-role-select")) {
        document.getElementById("auth-role-select").addEventListener("change", (e) => {
            setUserRole(e.target.value);
            refreshApplicationState();
        });
    }

    refreshApplicationState();
}

window.addEventListener("DOMContentLoaded", startSystemPipeline);