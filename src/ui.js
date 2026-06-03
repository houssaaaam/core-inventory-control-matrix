export function renderDashboardMetrics(metrics, role, hasPermission, uniqueCategories) {
    const skuBox = document.getElementById("metric-skus");
    const valBox = document.getElementById("metric-value");
    const alertBox = document.getElementById("metric-alerts");

    const formattedValue = `$${metrics.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (skuBox) skuBox.textContent = metrics.totalSKUs;
    if (valBox) valBox.textContent = formattedValue;
    if (alertBox) {
        alertBox.textContent = metrics.lowStockAlertsCount;
        alertBox.style.color = metrics.lowStockAlertsCount > 0 ? "#f43f5e" : "#10b981";
    }

    const indicator = document.getElementById("role-display-indicator");
    if (indicator) indicator.textContent = `Active Session: ${role}`;

    const adminControls = document.getElementById("admin-controls-section");
    if (adminControls) {
        adminControls.style.display = hasPermission("ADD_PRODUCT") ? "block" : "none";
    }

    // Pass the categories array down to the chart engine
    renderAnalyticsChart(metrics.categoryValuations, metrics.totalValue, formattedValue, uniqueCategories);
}

export function renderAnalyticsChart(categoryValuations, rawTotal, formattedString, uniqueCategories) {
    const canvasContext = document.getElementById("analytics-doughnut-chart");
    if (!canvasContext) return;

    // Use the dynamic database categories list instead of hardcoded labels
    const orderedLabels = uniqueCategories;
    const quantitativeData = orderedLabels.map(label => categoryValuations[label] || 0);

    const centerTextBox = document.getElementById("chart-center-value");
    if (centerTextBox) {
        centerTextBox.textContent = rawTotal > 0 ? formattedString : "$0.00";
    }

    // Generate beautiful theme colors dynamically based on the number of categories
    const generatedPalettes = generateThemeColorsForCategories(orderedLabels.length);

    if (window.systemChartInstance) {
        window.systemChartInstance.data.labels = orderedLabels;
        window.systemChartInstance.data.datasets[0].data = quantitativeData;
        window.systemChartInstance.data.datasets[0].borderColor = generatedPalettes.borders;
        window.systemChartInstance.data.datasets[0].backgroundColor = generatedPalettes.backgrounds;
        window.systemChartInstance.data.datasets[0].hoverBackgroundColor = generatedPalettes.borders;
        window.systemChartInstance.update();
        
        renderCustomHtmlLegend(orderedLabels, quantitativeData, generatedPalettes.borders);
        return;
    }

    window.systemChartInstance = new Chart(canvasContext, {
        type: 'doughnut',
        data: {
            labels: orderedLabels,
            datasets: [{
                data: quantitativeData,
                backgroundColor: generatedPalettes.backgrounds,
                borderColor: generatedPalettes.borders,
                borderWidth: 1.5,
                hoverBackgroundColor: generatedPalettes.borders,
                hoverBorderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            return ` Valuation: $${context.raw.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            cutout: '82%',
            borderRadius: 4,
            spacing: 2
        }
    });

    renderCustomHtmlLegend(orderedLabels, quantitativeData, generatedPalettes.borders);
}

// HELPER FUNCTION: Generates beautiful, balanced neon variations for any number of custom categories
function generateThemeColorsForCategories(count) {
    const baseColors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e"];
    const borders = [];
    const backgrounds = [];

    for (let i = 0; i < count; i++) {
        let hex = baseColors[i % baseColors.length];
        borders.push(hex);
        
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        backgrounds.push(`rgba(${r}, ${g}, ${b}, 0.2)`);
    }

    return { borders, backgrounds };
}

function renderCustomHtmlLegend(labels, data, colors) {
    const legendBox = document.getElementById("custom-chart-legend");
    if (!legendBox) return;

    const netSum = data.reduce((a, b) => a + b, 0);

    let htmlString = "";
    labels.forEach((label, idx) => {
        const val = data[idx];
        const percentage = netSum > 0 ? ((val / netSum) * 100).toFixed(0) : 0;
        
        htmlString += `
            <div style="display: flex; align-items: center; gap: 6px; color: #cbd5e1; background: #0f172a; padding: 4px 10px; border-radius: 20px; border: 1px solid #232e42; margin-bottom: 4px;">
                <span style="width: 8px; height: 8px; background-color: ${colors[idx]}; border-radius: 50%; display: inline-block;"></span>
                <span>${label}:</span>
                <span style="font-weight: 700; color: #f8fafc;">${percentage}%</span>
            </div>
        `;
    });
    
    legendBox.innerHTML = htmlString;
}

export function updateSystemStatusMessage(count) {
    const statusBox = document.getElementById("system-status");
    if (statusBox) {
        statusBox.textContent = `System Live: Safely connected to Supabase Cloud syncing ${count} items.`;
        statusBox.style.color = "#10b981";
    }
}

export function renderProductList(products, currentRole, hasPermission, onDelete, onIncrement, onDecrement, currentSort = { column: '', direction: '' }) {
    const tableContainer = document.getElementById("product-list-container");
    if (!tableContainer) return;

    if (!products || products.length === 0) {
        tableContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8; font-weight: 500;">No matching products remaining inside cloud storage blocks.</div>`;
        return;
    }

    const getSortArrow = (colName) => {
        if (currentSort.column !== colName) return '↕️';
        return currentSort.direction === 'asc' ? '🔼' : '🔽';
    };

    let html = `
        <table class="inventory-table" style="width:100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="border-bottom: 2px solid #334155; color: #94a3b8; font-size: 0.9rem;">
                    <th style="padding: 12px; width: 40px;"><input type="checkbox" id="master-select-checkbox"></th>
                    <th class="sortable-header" data-column="title" style="padding: 12px; cursor: pointer; user-select:none;">Product Title ${getSortArrow('title')}</th>
                    <th class="sortable-header" data-column="sku" style="padding: 12px; cursor: pointer; user-select:none;">SKU ${getSortArrow('sku')}</th>
                    <th class="sortable-header" data-column="category" style="padding: 12px; cursor: pointer; user-select:none;">Category ${getSortArrow('category')}</th>
                    <th class="sortable-header" data-column="price" style="padding: 12px; cursor: pointer; user-select:none;">Price ${getSortArrow('price')}</th>
                    <th class="sortable-header" data-column="stock" style="padding: 12px; cursor: pointer; user-select:none;">Stock Level ${getSortArrow('stock')}</th>
                    <th style="padding: 12px; text-align: right; width: 220px;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    products.forEach(product => {
        const isLowStock = product.stock < 10;
        html += `
            <tr style="border-bottom: 1px solid #1e293b; background-color: ${isLowStock ? 'rgba(244, 63, 94, 0.04)' : 'transparent'}; transition: background 0.2s;">
                <td style="padding: 12px;"><input type="checkbox" class="row-select-checkbox" data-id="${product.id}"></td>
                <td style="padding: 12px; font-weight: 500; color: #f8fafc;">${product.title}</td>
                <td style="padding: 12px; color: #94a3b8; font-family: monospace; font-size: 0.9rem;">${product.sku}</td>
                <td style="padding: 12px; color: #cbd5e1;"><span class="category-badge">${product.category}</span></td>
                <td style="padding: 12px; color: #10b981; font-weight: 600;">$${parseFloat(product.price).toFixed(2)}</td>
                <td style="padding: 12px; color: ${isLowStock ? '#f43f5e' : '#cbd5e1'}; font-weight: bold;">
                    <span style="display:inline-block; padding: 2px 6px; border-radius:4px; background:${isLowStock ? 'rgba(244, 63, 94, 0.1)' : 'transparent'};">
                        ${product.stock} ${isLowStock ? '⚠️' : ''}
                    </span>
                </td>
                <td style="padding: 12px; text-align: right;">
                    ${product.stock > 0 ? 
                        `<button class="sell-item-btn" data-id="${product.id}" style="padding:4px 10px; border-radius:4px; border:1px solid #10b981; background:rgba(16, 185, 129, 0.1); color:#10b981; cursor:pointer; font-weight:bold; margin-right:6px;">🛒 Sell</button>` :
                        `<span class="out-of-stock-badge" style="display:inline-block; padding:4px 10px; border-radius:4px; background:rgba(239, 68, 68, 0.1); color:#ef4444; font-size:0.8rem; font-weight:bold; margin-right:6px; border:1px solid rgba(239, 68, 68, 0.2);">Out of Stock</span>`
                    }
                    <button class="qty-btn minus-btn" data-id="${product.id}" style="padding:4px 10px; border-radius:4px; border:1px solid #334155; background:#1e293b; color:white; cursor:pointer; font-weight:bold; margin-right:2px;">-</button>
                    <button class="qty-btn plus-btn" data-id="${product.id}" style="padding:4px 10px; border-radius:4px; border:1px solid #334155; background:#1e293b; color:white; cursor:pointer; font-weight:bold; margin-right:8px;">+</button>
                    <button class="delete-row-btn" data-id="${product.id}" style="color:#ef4444; border:none; background:none; cursor:pointer; font-size:1.1rem; padding: 4px;">🗑️</button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    tableContainer.innerHTML = html;

    tableContainer.querySelectorAll(".plus-btn").forEach(btn => btn.addEventListener("click", () => onIncrement(btn.dataset.id)));
    tableContainer.querySelectorAll(".minus-btn").forEach(btn => btn.addEventListener("click", () => onDecrement(btn.dataset.id)));
    tableContainer.querySelectorAll(".delete-row-btn").forEach(btn => btn.addEventListener("click", () => onDelete(btn.dataset.id)));
    
    tableContainer.querySelectorAll(".sell-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const matchedProduct = products.find(p => p.id === btn.dataset.id);
            if (matchedProduct) window.openCheckoutModal(matchedProduct);
        });
    });
}