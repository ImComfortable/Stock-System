            let equipments = [];
            let currentFilter = "pageroom"; // Default filter

            function capitalizeFirst(str) {
                return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
            }

            function formatDate(dateStr) {
                if (!dateStr) return "Not informed";
                const date = new Date(dateStr);
                return date.toLocaleDateString("en-US");
            }

            function getStatusInfo(status) {
                const statusMap = {
                    Available: {
                        class: "available",
                        icon: "fas fa-check-circle",
                    },
                    "In use": { class: "in-use", icon: "fas fa-user-check" },
                    Maintenance: { class: "maintenance", icon: "fas fa-tools" },
                };
                return (
                    statusMap[status] || {
                        class: "available",
                        icon: "fas fa-question-circle",
                    }
                );
            }

            function showDetailsModal(itemId) {
                removeExistingModal();
                const eq = equipments.find((e) => e.id == itemId);
                if (!eq) return;

                const modalOverlay = document.createElement("div");
                modalOverlay.className = "modal-overlay";
                modalOverlay.id = "modalOverlay";

                const modal = document.createElement("div");
                modal.className = "modal";

                const iconMap = {
                    name: "fas fa-tag",
                    category: "fas fa-tags",
                    quantity: "fas fa-sort-numeric-up",
                    status: "fas fa-check-circle",
                    note: "fas fa-info-circle",
                    details: "fas fa-info",
                    entryDate: "fas fa-calendar-plus",
                    withdrawDate: "fas fa-calendar-minus",
                    lastUser: "fas fa-user",
                    lastQuantity: "fas fa-cubes",
                    originId: "fas fa-link",
                };

                let detailsHtml = "";
                let exclude = ["id", "image", "_id", "imageId"];

                Object.keys(eq).forEach((key) => {
                    if (!exclude.includes(key) && !key.startsWith("dyn_")) {
                        let value = eq[key];
                        if (key === "entryDate" || key === "withdrawDate")
                            value = formatDate(value);
                        if (typeof value === "string" && value.length === 0)
                            return;
                        const icon = iconMap[key]
                            ? `${iconMap[key]} info-icon`
                            : "fas fa-info info-icon";
                        detailsHtml += `
        <div class="info-item">
            <i class="${icon}"></i>
            <span class="info-label">${capitalizeFirst(key)}:</span>
            <span class="info-value">${DOMPurify.sanitize(String(value))}</span>
        </div>
        `;
                    }
                });

                modal.innerHTML = `
            <div class="modal-header">
                <h2 class="modal-title">Item Details</h2>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="info-grid-details">
                    ${detailsHtml}
                </div>
            </div>
        `;
                modalOverlay.appendChild(modal);
                document.body.appendChild(modalOverlay);
                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) closeModal();
                };
            }

            function showHistoryModal(itemId) {
                removeExistingModal();
                
                const modalOverlay = document.createElement("div");
                modalOverlay.className = "modal-overlay";
                modalOverlay.id = "modalOverlay";

                const modal = document.createElement("div");
                modal.className = "modal";

                modal.innerHTML = `
                    <div class="modal-header">
                        <h2 class="modal-title">Item History</h2>
                        <button class="modal-close" onclick="closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="historyContent">Loading history...</div>
                    </div>
                `;
                
                modalOverlay.appendChild(modal);
                document.body.appendChild(modalOverlay);
                
                // Fetch history from server
                fetch(`/get-equipment-history/${itemId}`)
                    .then(response => response.json())
                    .then(data => {
                        const historyContent = document.getElementById('historyContent');
                        if (data.success && data.history.length > 0) {
                            let historyHtml = '<div class="history-list">';
                            data.history.forEach(entry => {
                                const date = formatDate(entry.date);
                                const action = entry.action === 'withdraw' ? 'Retirada' : 'Exclusão';
                                const iconClass = entry.action === 'withdraw' ? 'fas fa-sign-out-alt' : 'fas fa-trash';
                                const historyIconClass = entry.action === 'withdraw' ? 'withdraw' : 'delete';
                                
                                historyHtml += `
                                    <div class="history-entry">
                                        <div class="history-icon ${historyIconClass}">
                                            <i class="${iconClass}"></i>
                                        </div>
                                        <div class="history-details">
                                            <div class="history-action">${action}</div>
                                            <div class="history-user">Por: ${DOMPurify.sanitize(entry.userName)}</div>
                                            <div class="history-date">${date}</div>
                                            ${entry.quantity ? `<div class="history-quantity">Quantidade: ${entry.quantity}</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            });
                            historyHtml += '</div>';
                            historyContent.innerHTML = historyHtml;
                        } else {
                            historyContent.innerHTML = '<p>No history found for this item.</p>';
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching history:', error);
                        document.getElementById('historyContent').innerHTML = '<p>Error loading history.</p>';
                    });

                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) closeModal();
                };
            }

            function addDynamicField(container, key = "", value = "") {
                const div = document.createElement("div");
                div.className = "dynamic-field-row";
                div.innerHTML = `
            <input class="form-input" type="text" name="dyn_key[]" placeholder="Field name" value="${DOMPurify.sanitize(key)}" style="flex:1;" autocomplete="off">
            <input class="form-input" type="text" name="dyn_value[]" placeholder="Value" value="${DOMPurify.sanitize(value)}" style="flex:2;" autocomplete="off">
            <button type="button" class="btn-delete" title="Remove" tabindex="-1">
                <i class="fas fa-times"></i>
            </button>
        `;
                div.querySelector(".btn-delete").onclick = function () {
                    div.remove();
                };
                container.appendChild(div);
            }

            function createItemForm(isEdit) {
                return `
        <div class="form-group">
            <label class="form-label" for="location">Localização</label>
            <select class="form-select" name="location" id="location" required>
                <option value="">Selecione a localização</option>
                <option value="pagecar">Estoque Carro</option>
                <option value="pageroom">Estoque Salinha</option>
                <option value="deposito">Depósito</option>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label" for="name">Item Name</label>
            <input class="form-input" type="text" name="name" id="name" required>
        </div>
        <div class="form-group">
            <label class="form-label">Item Image</label>
            <div class="file-input-wrapper">
                <input type="file" name="image" id="image" accept="image/png,image/jpeg">
                <div class="file-input-label">
                    <i class="fas fa-cloud-upload-alt file-input-icon"></i>
                    <span>Click or drag an image here</span>
                    <small>PNG or JPEG up to 5MB</small>
                </div>
            </div>
            ${isEdit ? "<small>Leave blank to keep the current image</small>" : ""}
        </div>
        <div class="form-group">
            <label class="form-label" for="category">Category</label>
            <input class="form-input" type="text" name="category" id="category" required>
        </div>
        <div class="form-group">
            <label class="form-label" for="quantity">Quantity</label>
            <input class="form-input" type="number" name="quantity" id="quantity" min="0" required>
        </div>
        <div class="form-group">
            <label class="form-label" for="status">Status</label>
            <select class="form-select" name="status" id="status" required>
                <option value="Available">Available</option>
                <option value="In use">In use</option>
                <option value="Maintenance">Maintenance</option>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label" for="note">Note</label>
            <textarea class="form-textarea" name="note" id="note"></textarea>
        </div>
        <div class="form-group">
            <label class="form-label">Additional Fields</label>
            <div class="dynamic-fields-wrapper" id="dynamicFields"></div>
            <button type="button" class="add-dynamic-btn" id="addFieldBtn">
                <i class="fas fa-plus"></i> Add Field
            </button>
        </div>
        `;
            }

            function createWithdrawForm() {
                return `
                <div class="form-group">
                    <label class="form-label" for="lastUser">Nome de quem está retirando</label>
                    <input class="form-input" type="text" name="lastUser" id="lastUser" placeholder="Digite o nome" required>
                </div>
        <div class="form-group">
            <label class="form-label" for="quantity">Quantity</label>
            <input class="form-input" type="number" name="quantity" id="quantity" min="1" required>
        </div>
                <div class="form-group">
                    <label class="form-label" for="note">Note</label>
                    <textarea class="form-textarea" name="note" id="note"></textarea>
                </div>
            `;
            }

            function closeModal() {
                const modal = document.getElementById("modalOverlay");
                if (modal) modal.remove();
            }

            function removeExistingModal() {
                closeModal();
            }

            document.getElementById("addItemBtn").onclick = () =>
                showModal("add");

            function editItem(id, btn) {
                setButtonLoading(btn, true);
                setTimeout(() => {
                    setButtonLoading(btn, false);
                    showModal("edit", id);
                }, 200);
            }

            function withdrawItem(id, btn) {
                setButtonLoading(btn, true);
                setTimeout(() => {
                    setButtonLoading(btn, false);
                    showModal("withdraw", id);
                }, 200);
            }

            function showDeleteModal(itemId) {
                removeExistingModal();

                const modalOverlay = document.createElement("div");
                modalOverlay.className = "modal-overlay";
                modalOverlay.id = "modalOverlay";

                const modal = document.createElement("div");
                modal.className = "modal";

                modal.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title">Delete Item</h2>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
            <form id="deleteForm" class="form-grid">
                <div class="form-group">
                    <label class="form-label" for="deletedBy">Nome de quem está excluindo</label>
                    <input class="form-input" type="text" name="deletedBy" id="deletedBy" placeholder="Digite o nome" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="deleteQuantity">Quantity to delete</label>
                    <input class="form-input" type="number" name="deleteQuantity" id="deleteQuantity" min="1" required>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn-submit">Confirm Delete</button>
                </div>
            </form>
        </div>
    `;

                modalOverlay.appendChild(modal);
                document.body.appendChild(modalOverlay);

                modal.querySelector("#deleteForm").onsubmit = async function (
                    e,
                ) {
                    e.preventDefault();
                    const quantity = parseInt(
                        document.getElementById("deleteQuantity").value,
                        10,
                    );
                    const deletedBy = document.getElementById("deletedBy").value.trim();
                    
                    if (isNaN(quantity) || quantity <= 0) {
                        alert("Please enter a valid quantity.");
                        return;
                    }
                    
                    if (!deletedBy) {
                        alert("Please enter the name of who is deleting the item.");
                        return;
                    }

                    try {
                        const response = await fetch("/delete-equipment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: itemId, quantity, deletedBy }),
                        });

                        if (response.ok) {
                            closeModal();
                            await getEquipments();
                        } else {
                            const error = await response.json();
                            alert(error.error || "Error deleting item.");
                        }
                    } catch (err) {
                        alert("Error deleting item: " + err.message);
                    }
                };

                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) closeModal();
                };
            }

            function deleteItem(id, btn) {
                showDeleteModal(id);
            }

            document.getElementById("addItemBtn").onclick = () =>
                showModal("add");

            function showModal(type, editId = null) {
                removeExistingModal();

                const modalOverlay = document.createElement("div");
                modalOverlay.className = "modal-overlay";
                modalOverlay.id = "modalOverlay";

                const modal = document.createElement("div");
                modal.className = "modal";

                const isWithdraw = type === "withdraw";
                const isEdit = type === "edit";

                let title = "Add Item";
                if (isEdit) title = "Edit Item";
                else if (isWithdraw) title = "Withdraw Item";

                modal.innerHTML = `
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="itemForm" class="form-grid">
                        ${isWithdraw ? createWithdrawForm() : createItemForm(isEdit)}
                        <div class="form-actions">
                            <button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn-submit">
                                ${isEdit ? "Save Changes" : isWithdraw ? "Confirm Withdraw" : "Add Item"}
                            </button>
                        </div>
                    </form>
                </div>
            `;

                modalOverlay.appendChild(modal);
                document.body.appendChild(modalOverlay);

                if (!isWithdraw) {
                    const dynFieldsContainer =
                        modal.querySelector("#dynamicFields");
                    modal.querySelector("#addFieldBtn").onclick = function (e) {
                        e.preventDefault();
                        addDynamicField(dynFieldsContainer);
                    };
                    if (isEdit && editId) {
                        setTimeout(() => {
                            const eq = equipments.find((e) => e.id == editId);
                            if (!eq) return;
                            const exclude = [
                                "_id",
                                "id",
                                "name",
                                "imageId",
                                "image",
                                "category",
                                "quantity",
                                "status",
                                "note",
                                "entryDate",
                                "withdrawDate",
                                "lastUser",
                                "originId",
                            ];
                            Object.keys(eq).forEach((key) => {
                                if (
                                    !exclude.includes(key) &&
                                    !key.startsWith("dyn_")
                                ) {
                                    addDynamicField(
                                        dynFieldsContainer,
                                        key,
                                        eq[key],
                                    );
                                }
                            });
                        }, 100);
                    }
                }

                const fileInput = modal.querySelector('input[type="file"]');
                if (fileInput) {
                    fileInput.onchange = function () {
                        const file = this.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = function (e) {
                                const preview = document.createElement("img");
                                preview.src = e.target.result;
                                preview.className = "equipment-img";
                                preview.style.marginTop = "1rem";
                                const wrapper = fileInput.closest(
                                    ".file-input-wrapper",
                                );
                                const existingPreview =
                                    wrapper.querySelector("img");
                                if (existingPreview) {
                                    existingPreview.remove();
                                }
                                wrapper.appendChild(preview);
                            };
                            reader.readAsDataURL(file);
                        }
                    };
                }

                if (isEdit || isWithdraw) {
                    setTimeout(() => {
                        if (!document.body.contains(modal)) return;

                        const eq = equipments.find((e) => e.id == editId);
                        if (!eq) return;

                        const form = modal.querySelector("#itemForm");
                        if (!form || !document.body.contains(form)) return;

                        Object.keys(eq).forEach((key) => {
                            try {
                                const input = form.querySelector(
                                    `[name="${key}"]`,
                                );
                                if (input && document.body.contains(input)) {
                                    if (input.type === "checkbox") {
                                        input.checked = !!eq[key];
                                    } else if (input.tagName === "SELECT") {
                                        const options = Array.from(
                                            input.options,
                                        );
                                        options.forEach((opt) => {
                                            if (opt && opt.parentNode) {
                                                opt.selected =
                                                    opt.value == eq[key];
                                            }
                                        });
                                    } else if (input.tagName === "TEXTAREA") {
                                        input.value = eq[key] || "";
                                    } else {
                                        input.value = eq[key] ?? "";
                                    }
                                }
                            } catch (error) {
                                console.warn(
                                    "Error filling field:",
                                    key,
                                    error,
                                );
                            }
                        });
                    }, 100);
                }

                modal.querySelector("#itemForm").onsubmit = async function (e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const data = {};
                    for (let [key, value] of formData.entries()) {
                        data[key] = value;
                    }

                    if (!isWithdraw) {
                        const dynKeys = Array.from(
                            modal.querySelectorAll('input[name="dyn_key[]"]'),
                        );
                        const dynVals = Array.from(
                            modal.querySelectorAll('input[name="dyn_value[]"]'),
                        );
                        for (let i = 0; i < dynKeys.length; i++) {
                            const key = dynKeys[i].value.trim();
                            if (key) {
                                data[key] = dynVals[i] ? dynVals[i].value : "";
                            }
                        }
                    }

                    let imageId = null;
                    const imageFile = formData.get("image");
                    if (imageFile && imageFile.size > 0) {
                        if (imageFile.size > 5 * 1024 * 1024) {
                            alert("The image must be at most 5MB");
                            return;
                        }
                        if (
                            !["image/png", "image/jpeg"].includes(
                                imageFile.type,
                            )
                        ) {
                            alert("Only PNG or JPEG images are allowed");
                            return;
                        }
                        const imgForm = new FormData();
                        imgForm.append("image", imageFile);
                        const imgRes = await fetch("/upload-image", {
                            method: "POST",
                            body: imgForm,
                        });
                        if (!imgRes.ok) {
                            throw new Error("Error uploading image");
                        }
                        const imgData = await imgRes.json();
                        imageId = imgData.fileId;
                    }

                    try {
                        if (isEdit) {
                            await fetch("/add-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...data,
                                    id: editId,
                                    ...(imageId ? { imageId } : {}),
                                }),
                            });
                        } else if (isWithdraw) {
                            await fetch("/withdraw-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    id: editId,
                                    withdrawDate: new Date()
                                        .toISOString()
                                        .slice(0, 10),
                                    lastUser: data.lastUser,
                                    quantity: data.quantity || 1,
                                    note: data.note || "",
                                }),
                            });
                        } else {
                            await fetch("/add-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...data,
                                    status: "Available",
                                    entryDate: new Date()
                                        .toISOString()
                                        .slice(0, 10),
                                    ...(imageId ? { imageId } : {}),
                                }),
                            });
                        }

                        closeModal();
                        await getEquipments();
                    } catch (err) {
                        alert("Error saving to database: " + err.message);
                    }
                };

                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) closeModal();
                };
            }

            function renderEquipments(searchTerm = "") {
                renderSummary();
                const grid = document.getElementById("equipmentGrid");

                let filtered = equipments.filter(
                    (eq) =>
                        // Filter by location first
                        eq.location === currentFilter &&
                        // Then apply search filter
                        ((eq.name || "")
                            .toLowerCase()
                            .includes(searchTerm.toLowerCase()) ||
                            (eq.category || "")
                                .toLowerCase()
                                .includes(searchTerm.toLowerCase()) ||
                            (eq.status || "")
                                .toLowerCase()
                                .includes(searchTerm.toLowerCase()) ||
                            (eq.lastUser || "")
                                .toLowerCase()
                                .includes(searchTerm.toLowerCase())),
                );

                if (filtered.length === 0) {
                    const locationName =
                        currentFilter === "pagecar"
                            ? "Estoque Carro"
                            : "Estoque Salinha";
                    const hasSearchTerm = searchTerm.length > 0;

                    grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-icon">
                        <i class="fas fa-${hasSearchTerm ? "search" : "box-open"}"></i>
                    </div>
                    <div class="empty-title">${hasSearchTerm ? "No items found" : "No items in " + locationName}</div>
                    <div class="empty-description">${hasSearchTerm ? "Try adjusting your search terms" : 'Add new items to this location using the "Add Item" button'}</div>
                </div>
            `;
                    return;
                }

                const DEFAULT_IMAGE = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#f3f4f6"/>
    <path d="M100 70 C 70 70, 50 85, 50 110 C 50 135, 70 150, 100 150 C 130 150, 150 135, 150 110 C 150 85, 130 70, 100 70" fill="#9ca3af"/>
    <circle cx="82" cy="100" r="8" fill="#f3f4f6"/>
    <circle cx="118" cy="100" r="8" fill="#f3f4f6"/>
    <path d="M75 125 Q 100 140 125 125" stroke="#f3f4f6" stroke-width="4" fill="none"/>
    <text x="100" y="180" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="14">No Image</text>
</svg>`)}`;

                grid.innerHTML = filtered
                    .map((eq) => {
                        const statusInfo = getStatusInfo(eq.status);
                        return `
         <div class="equipment-card">
<div class="card-image-container">
    <a href="/image/${eq.imageId}" target="_blank">
        <img src="/image/${eq.imageId}" alt="Item photo" class="equipment-img" onerror="this.src='${DEFAULT_IMAGE}'">
    </a>
</div>
            <div class="card-header">
                <div class="card-title">
                    <div class="status-indicator ${statusInfo.class}"></div>
                    ${DOMPurify.sanitize(eq.name || "")}
                </div>
            </div>
            <div class="card-body">
                <div class="info-grid">
                    <div class="info-item">
                        <i class="fas fa-tags info-icon"></i>
                        <span class="info-label">Category:</span>
                        <span class="info-value">${capitalizeFirst(eq.category)}</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-sort-numeric-up info-icon"></i>
                        <span class="info-label">Quantity:</span>
                        <span class="info-value">${eq.quantity || 0}</span>
                    </div>
<div class="info-item">
    <i class="fas fa-check-circle info-icon"></i>
    <span class="info-label">Status:</span>
    <span class="badge ${statusInfo.class}">${eq.status}</span>
</div>
                             <div class="info-item">
                        <i class="fas fa-info-circle info-icon"></i>
                        <span class="info-label">Note:</span>
                        <span class="info-value">${DOMPurify.sanitize(eq.note || "")}</span>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-action btn-details" onclick="showDetailsModal('${eq.id}')" title="Details">
                    <span class="btn-icon-content"><i class="fas fa-eye"></i></span>
                </button>
                <button class="btn-action btn-history" onclick="showHistoryModal('${eq.id}')" title="History">
                    <span class="btn-icon-content"><i class="fas fa-history"></i></span>
                </button>
                <button class="btn-action btn-edit" onclick="editItem('${eq.id}', this)" title="Edit">
                    <span class="btn-icon-content"><i class="fas fa-edit"></i></span>
                </button>
                ${
                    eq.status === "Available"
                        ? `<button class="btn-action btn-withdraw" onclick="withdrawItem('${eq.id}', this)" title="Withdraw">
                            <span class="btn-icon-content"><i class="fas fa-sign-out-alt"></i></span>
                        </button>`
                        : eq.status === "In use"
                          ? `<button class="btn-action btn-edit" onclick="returnItem('${eq.id}', this)" title="Return">
                            <span class="btn-icon-content"><i class="fas fa-undo"></i></span>
                        </button>`
                          : ""
                }
                <button class="btn-action btn-delete" onclick="deleteItem('${eq.id}', this)" title="Delete">
                    <span class="btn-icon-content"><i class="fas fa-trash"></i></span>
                </button>
            </div>
        </div>
    `;
                    })
                    .join("");
            }

            // Add event listeners for filter buttons
            document.addEventListener("DOMContentLoaded", function () {
                const filterButtons = document.querySelectorAll(".filter-btn");

                filterButtons.forEach((button) => {
                    button.addEventListener("click", function () {
                        // Remove active class from all buttons
                        filterButtons.forEach((btn) =>
                            btn.classList.remove("active"),
                        );

                        // Add active class to clicked button
                        this.classList.add("active");

                        // Update current filter
                        currentFilter = this.getAttribute("data-filter");

                        // Re-render equipments with new filter
                        renderEquipments();
                        renderSummary();
                    });
                });

                // Remove active class from all buttons first
                filterButtons.forEach((btn) => btn.classList.remove("active"));

                // Set default active button
                document
                    .querySelector('[data-filter="pageroom"]')
                    .classList.add("active");

                // Initial render with default filter
                getEquipments();
            });

            document
                .getElementById("searchInput")
                .addEventListener("input", function () {
                    const query = this.value.toLowerCase();
                    renderEquipments(query);
                });

            function setButtonLoading(btn, loading = true) {
                if (!btn) return;
                if (loading) {
                    btn.classList.add("loading");
                    if (!btn.querySelector(".loading-spinner")) {
                        const spinner = document.createElement("span");
                        spinner.className =
                            "loading-spinner fas fa-spinner fa-spin";
                        btn.appendChild(spinner);
                    }
                } else {
                    btn.classList.remove("loading");
                    const spinner = btn.querySelector(".loading-spinner");
                    if (spinner) spinner.remove();
                }
            }

            function returnItem(id, btn) {
                setButtonLoading(btn, true);
                fetch("/return-equipment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id }),
                })
                    .then(async (res) => {
                        setButtonLoading(btn, false);
                        if (res.ok) {
                            await getEquipments();
                        } else {
                            alert("Error returning item!");
                        }
                    })
                    .catch(() => {
                        setButtonLoading(btn, false);
                        alert("Error returning item!");
                    });
            }

            function editItem(id, btn) {
                setButtonLoading(btn, true);
                setTimeout(() => {
                    setButtonLoading(btn, false);
                    showModal("edit", id);
                }, 200);
            }

            function withdrawItem(id, btn) {
                setButtonLoading(btn, true);
                setTimeout(() => {
                    setButtonLoading(btn, false);
                    showModal("withdraw", id);
                }, 200);
            }

            function deleteItem(id, btn) {
                showDeleteModal(id);
            }

            document.getElementById("addItemBtn").onclick = () =>
                showModal("add");

            function showModal(type, editId = null) {
                removeExistingModal();

                const modalOverlay = document.createElement("div");
                modalOverlay.className = "modal-overlay";
                modalOverlay.id = "modalOverlay";

                const modal = document.createElement("div");
                modal.className = "modal";

                const isWithdraw = type === "withdraw";
                const isEdit = type === "edit";

                let title = "Add Item";
                if (isEdit) title = "Edit Item";
                else if (isWithdraw) title = "Withdraw Item";

                modal.innerHTML = `
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="itemForm" class="form-grid">
                        ${isWithdraw ? createWithdrawForm() : createItemForm(isEdit)}
                        <div class="form-actions">
                            <button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn-submit">
                                ${isEdit ? "Save Changes" : isWithdraw ? "Confirm Withdraw" : "Add Item"}
                            </button>
                        </div>
                    </form>
                </div>
            `;

                modalOverlay.appendChild(modal);
                document.body.appendChild(modalOverlay);

                if (!isWithdraw) {
                    const dynFieldsContainer =
                        modal.querySelector("#dynamicFields");
                    modal.querySelector("#addFieldBtn").onclick = function (e) {
                        e.preventDefault();
                        addDynamicField(dynFieldsContainer);
                    };

                    // Set default location for new items
                    if (!isEdit) {
                        const locationSelect = modal.querySelector("#location");
                        if (locationSelect) {
                            locationSelect.value = currentFilter;
                        }
                    }

                    if (isEdit && editId) {
                        setTimeout(() => {
                            const eq = equipments.find((e) => e.id == editId);
                            if (!eq) return;
                            const exclude = [
                                "_id",
                                "id",
                                "name",
                                "imageId",
                                "image",
                                "category",
                                "quantity",
                                "status",
                                "note",
                                "entryDate",
                                "withdrawDate",
                                "lastUser",
                                "originId",
                            ];
                            Object.keys(eq).forEach((key) => {
                                if (
                                    !exclude.includes(key) &&
                                    !key.startsWith("dyn_")
                                ) {
                                    addDynamicField(
                                        dynFieldsContainer,
                                        key,
                                        eq[key],
                                    );
                                }
                            });
                        }, 100);
                    }
                }

                const fileInput = modal.querySelector('input[type="file"]');
                if (fileInput) {
                    fileInput.onchange = function () {
                        const file = this.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = function (e) {
                                const preview = document.createElement("img");
                                preview.src = e.target.result;
                                preview.className = "equipment-img";
                                preview.style.marginTop = "1rem";
                                const wrapper = fileInput.closest(
                                    ".file-input-wrapper",
                                );
                                const existingPreview =
                                    wrapper.querySelector("img");
                                if (existingPreview) {
                                    existingPreview.remove();
                                }
                                wrapper.appendChild(preview);
                            };
                            reader.readAsDataURL(file);
                        }
                    };
                }

                if (isEdit || isWithdraw) {
                    setTimeout(() => {
                        if (!document.body.contains(modal)) return;

                        const eq = equipments.find((e) => e.id == editId);
                        if (!eq) return;

                        const form = modal.querySelector("#itemForm");
                        if (!form || !document.body.contains(form)) return;

                        Object.keys(eq).forEach((key) => {
                            try {
                                const input = form.querySelector(
                                    `[name="${key}"]`,
                                );
                                if (input && document.body.contains(input)) {
                                    if (input.type === "checkbox") {
                                        input.checked = !!eq[key];
                                    } else if (input.tagName === "SELECT") {
                                        const options = Array.from(
                                            input.options,
                                        );
                                        options.forEach((opt) => {
                                            if (opt && opt.parentNode) {
                                                opt.selected =
                                                    opt.value == eq[key];
                                            }
                                        });
                                    } else if (input.tagName === "TEXTAREA") {
                                        input.value = eq[key] || "";
                                    } else {
                                        input.value = eq[key] ?? "";
                                    }
                                }
                            } catch (error) {
                                console.warn(
                                    "Error filling field:",
                                    key,
                                    error,
                                );
                            }
                        });
                    }, 100);
                }

                modal.querySelector("#itemForm").onsubmit = async function (e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const data = {};
                    for (let [key, value] of formData.entries()) {
                        data[key] = value;
                    }

                    if (!isWithdraw) {
                        const dynKeys = Array.from(
                            modal.querySelectorAll('input[name="dyn_key[]"]'),
                        );
                        const dynVals = Array.from(
                            modal.querySelectorAll('input[name="dyn_value[]"]'),
                        );
                        for (let i = 0; i < dynKeys.length; i++) {
                            const key = dynKeys[i].value.trim();
                            if (key) {
                                data[key] = dynVals[i] ? dynVals[i].value : "";
                            }
                        }
                    }

                    let imageId = null;
                    const imageFile = formData.get("image");
                    if (imageFile && imageFile.size > 0) {
                        if (imageFile.size > 5 * 1024 * 1024) {
                            alert("The image must be at most 5MB");
                            return;
                        }
                        if (
                            !["image/png", "image/jpeg"].includes(
                                imageFile.type,
                            )
                        ) {
                            alert("Only PNG or JPEG images are allowed");
                            return;
                        }
                        const imgForm = new FormData();
                        imgForm.append("image", imageFile);
                        const imgRes = await fetch("/upload-image", {
                            method: "POST",
                            body: imgForm,
                        });
                        if (!imgRes.ok) {
                            throw new Error("Error uploading image");
                        }
                        const imgData = await imgRes.json();
                        imageId = imgData.fileId;
                    }

                    try {
                        if (isEdit) {
                            await fetch("/add-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...data,
                                    id: editId,
                                    ...(imageId ? { imageId } : {}),
                                }),
                            });
                        } else if (isWithdraw) {
                            await fetch("/withdraw-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    id: editId,
                                    withdrawDate: new Date()
                                        .toISOString()
                                        .slice(0, 10),
                                    lastUser: data.lastUser,
                                    quantity: data.quantity || 1,
                                    note: data.note || "",
                                }),
                            });
                        } else {
                            await fetch("/add-equipment", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...data,
                                    status: "Available",
                                    entryDate: new Date()
                                        .toISOString()
                                        .slice(0, 10),
                                    ...(imageId ? { imageId } : {}),
                                }),
                            });
                        }

                        closeModal();
                        await getEquipments();
                    } catch (err) {
                        alert("Error saving to database: " + err.message);
                    }
                };

                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) closeModal();
                };
            }

            function renderSummary() {
                // Filter equipments by current location
                const filteredEquipments = equipments.filter(
                    (e) => e.location === currentFilter,
                );

                const totalQuantity = filteredEquipments.reduce(
                    (sum, e) => sum + (parseInt(e.quantity) || 0),
                    0,
                );
                const available = filteredEquipments
                    .filter((e) => e.status === "Available")
                    .reduce((sum, e) => sum + (parseInt(e.quantity) || 0), 0);
                const inUse = filteredEquipments
                    .filter((e) => e.status === "In use")
                    .reduce((sum, e) => sum + (parseInt(e.quantity) || 0), 0);
                const maintenance = filteredEquipments
                    .filter((e) => e.status === "Maintenance")
                    .reduce((sum, e) => sum + (parseInt(e.quantity) || 0), 0);

                const locationName =
                    currentFilter === "pagecar" ? "Carro" : 
                    currentFilter === "deposito" ? "Depósito" : "Salinha";

                document.getElementById("summaryPanel").innerHTML = `
                <div class="summary-card">
                    <div class="summary-header">
                        <i class="fas fa-boxes summary-icon" style="color: var(--primary)"></i>
                        <div class="summary-value">${totalQuantity}</div>
                    </div>
                    <div class="summary-label">Total Items - ${locationName}</div>
                </div>
                <div class="summary-card success">
                    <div class="summary-header">
                        <i class="fas fa-check-circle summary-icon" style="color: var(--success)"></i>
                        <div class="summary-value">${available}</div>
                    </div>
                    <div class="summary-label">Available</div>
                </div>
                <div class="summary-card warning">
                    <div class="summary-header">
                        <i class="fas fa-user-check summary-icon" style="color: var(--warning)"></i>
                        <div class="summary-value">${inUse}</div>
                    </div>
                    <div class="summary-label">In Use</div>
                </div>
                <div class="summary-card danger">
                    <div class="summary-header">
                        <i class="fas fa-tools summary-icon" style="color: var(--danger)"></i>
                        <div class="summary-value">${maintenance}</div>
                    </div>
                    <div class="summary-label">Maintenance</div>
                </div>
            `;
            }

            function getEquipments() {
                fetch("/get_all_equipments")
                    .then((res) => res.json())
                    .then((data) => {
                        equipments = data;
                        renderEquipments();
                    })
                    .catch((err) =>
                        console.error("Error fetching equipments:", err),
                    );
            }

            getEquipments();