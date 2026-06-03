// Verified project API configuration settings
const SUPABASE_URL = "https://lsoqmiecavhmruuoswrr.supabase.co"; 

// PASTE YOUR FULL COPIED KEY INSIDE THESE QUOTES BELOW 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzb3FtaWVjYXZobXJ1dW9zd3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODcwNTAsImV4cCI6MjA5NjA2MzA1MH0.JQRPQi2Oxy32QqosIAWtyFOOpg7cq5aHZnBj9Fh4Jjk";

// Initialize the client explicitly with configurations
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

const AUTH_KEY = "matrix_auth_role";

export async function fetchCloudInventory() {
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('*');

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error("❌ Cloud Error fetching data records:", err.message);
        return [];
    }
}

export async function insertCloudProduct(product) {
    try {
        const { error } = await supabase
            .from('inventory')
            .insert([product]);

        if (error) throw error;
    } catch (err) {
        console.error("❌ Cloud Error writing database object:", err.message);
        alert("Database Message: " + (err.message || err.toString()));
    }
}

export async function deleteCloudProduct(productId) {
    try {
        const { error } = await supabase
            .from('inventory')
            .delete()
            .eq('id', productId);

        if (error) throw error;
    } catch (err) {
        console.error("❌ Cloud Error processing removal:", err.message);
    }
}

export async function updateCloudProductStock(productId, newStockLevel) {
    try {
        const { error } = await supabase
            .from('inventory')
            .update({ stock: newStockLevel })
            .eq('id', productId);

        if (error) throw error;
    } catch (err) {
        console.error("❌ Cloud Error processing stock modification:", err.message);
    }
}

export async function resetCloudDatabaseBaseline(seedArray) {
    try {
        // Clear all products securely
        const { error: clearError } = await supabase
            .from('inventory')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (clearError) throw clearError;

        const { error: insertError } = await supabase
            .from('inventory')
            .insert(seedArray);

        if (insertError) throw insertError;
    } catch (err) {
        console.error("❌ Cloud Error running master migration seeds:", err.message);
    }
}

export function saveUserRoleToken(role) {
    localStorage.setItem(AUTH_KEY, role);
}

export function loadUserRoleToken() {
    return localStorage.getItem(AUTH_KEY) || "Admin";
}