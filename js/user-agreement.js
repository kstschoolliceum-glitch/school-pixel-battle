/* ---------- USER AGREEMENT ---------- */

(() => {
  const AGREEMENT_VERSION = "1.1";
  const dialog =
    document.getElementById("user-agreement-dialog");
  const checkbox =
    document.getElementById("user-agreement-checkbox");
  const acceptButton =
    document.getElementById("user-agreement-accept");

  if (!dialog || !checkbox || !acceptButton) return;

  function storageKey() {
    const userId = currentUser?.id || "guest";
    return `pixel-battle-agreement:${AGREEMENT_VERSION}:${userId}`;
  }

  window.showUserAgreementIfNeeded = () => {
    if (
      !currentUser ||
      localStorage.getItem(storageKey()) === "accepted"
    ) {
      return;
    }

    checkbox.checked = false;
    acceptButton.disabled = true;

    if (!dialog.open) {
      dialog.showModal();
    }
  };

  checkbox.addEventListener("change", () => {
    acceptButton.disabled = !checkbox.checked;
  });

  acceptButton.addEventListener("click", () => {
    if (!checkbox.checked || !currentUser) return;

    localStorage.setItem(storageKey(), "accepted");
    dialog.close();
  });

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
  });

  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      event.preventDefault();
    }
  });
})();
