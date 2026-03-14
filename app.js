const filterInput = document.getElementById("endpointFilter");
const table = document.getElementById("apiTable");

if (filterInput && table) {
  filterInput.addEventListener("input", (event) => {
    const value = event.target.value.trim().toLowerCase();
    const rows = Array.from(table.querySelectorAll("tbody tr"));

    rows.forEach((row) => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(value) ? "" : "none";
    });
  });
}

const copyButtons = document.querySelectorAll(".copy-btn");
copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const selector = button.getAttribute("data-copy");
    const target = selector ? document.querySelector(selector) : null;
    if (!target) return;

    const text = target.innerText;
    try {
      await navigator.clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = old || "Copy";
      }, 1200);
    } catch (_) {
      button.textContent = "Failed";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 1200);
    }
  });
});
