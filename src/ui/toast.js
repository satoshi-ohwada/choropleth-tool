// Toast Notification Controller

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let iconClass = "fa-circle-info text-blue";
  if (type === "success") iconClass = "fa-circle-check text-green";
  if (type === "warning") iconClass = "fa-triangle-exclamation text-yellow";
  if (type === "error") iconClass = "fa-circle-xmark text-red";

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3500);
}
