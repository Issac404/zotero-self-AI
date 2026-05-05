/* global Zotero, document, window */
(function () {
  "use strict";

  try {
    // 关键日志：确认脚本文件被加载并执行
    Zotero.debug("[Self-AI] preferences.js script executed.");

    const buttonId = "__addonRef__-openMainWindow";
    const openButton = document.getElementById(buttonId);

    if (openButton) {
      Zotero.debug(
        "[Self-AI] Button found. Attaching click listener directly.",
      );

      openButton.addEventListener("click", function () {
        try {
          Zotero.debug("[Self-AI] Button clicked - opening main window");

          const addonInstance = Zotero.SelfAI;
          if (
            addonInstance &&
            typeof addonInstance.hooks?.onOpenMainWindow === "function"
          ) {
            Zotero.debug("[Self-AI] Calling onOpenMainWindow hook");
            addonInstance.hooks.onOpenMainWindow();
          } else {
            Zotero.debug("[Self-AI] Hook not found, trying backup method");
            const win = Zotero.getMainWindow();
            if (win && win.document) {
              const menuItem = win.document.getElementById(
                "zotero-itemmenu-self-ai-summary",
              );
              if (menuItem) {
                menuItem.click();
              } else {
                Zotero.debug("[Self-AI] Menu item not found");
              }
            }
          }
        } catch (e) {
          Zotero.debug("[Self-AI] Error in button click handler: " + e);
        }
      });

      Zotero.debug("[Self-AI] Click listener attached successfully.");
    } else {
      Zotero.debug("[Self-AI] Button not found with ID: " + buttonId);
    }

    const addonInstance = Zotero.SelfAI;
    if (
      addonInstance &&
      typeof addonInstance.hooks?.onPrefsEvent === "function"
    ) {
      Zotero.debug('[Self-AI] Calling onPrefsEvent hook for "load" event.');
      addonInstance.hooks.onPrefsEvent("load", { window: window });
    }
  } catch (e) {
    Zotero.debug("[Self-AI] Fatal error in preferences.js: " + e);
  }
})();
