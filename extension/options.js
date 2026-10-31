const box = document.getElementById("openWebEpubs");

chrome.storage.local.get({ openWebEpubs: true }).then((v) => {
  box.checked = v.openWebEpubs;
});
box.addEventListener("change", () => chrome.storage.local.set({ openWebEpubs: box.checked }));
