/**
 * ================================================================
 * 条目面板侧边栏区块模块
 * ================================================================
 *
 * 在 Zotero 右侧条目面板中添加 PDF 解析流水线区块
 *
 * @module ItemPaneSection
 * @author Self-AI Team
 */

import { config } from "../../package.json";
import { getString, getLocaleID } from "../utils/locale";

import { PdfSplitView } from "./views/PdfSplitView";

/**
 * 注册条目面板侧边栏区块
 */
export function registerItemPaneSection(): void {
  const pluginID = config.addonID;
  const rootURI = `chrome://${config.addonRef}/content/`;

  try {
    (Zotero as any).ItemPaneManager.registerSection({
      paneID: "self-ai-chat-section",
      pluginID: pluginID,
      header: {
        l10nID: getLocaleID("itempane-ai-section-header" as any),
        label: "AI 管家",
        icon: rootURI + "icons/logo.png",
      },
      sidenav: {
        l10nID: getLocaleID("itempane-ai-section-sidenav" as any),
        tooltiptext: "AI 管家",
        icon: rootURI + "icons/logo.png",
      },
      onRender: ({ body, item }: any) => {
        renderItemPaneSection(body, item);
      },
    });

    ztoolkit.log("[Self-AI] 条目面板区块已注册");
  } catch (error) {
    ztoolkit.log("[Self-AI] 注册条目面板区块失败:", error);
  }
}

/**
 * 渲染条目面板侧边栏内容
 */
function renderItemPaneSection(
  body: HTMLElement,
  item: Zotero.Item,
): void {
  body.innerHTML = "";
  const doc = body.ownerDocument;

  // 安全检查 doc
  if (!doc) {
    ztoolkit.log("[Self-AI] 无法获取 ownerDocument");
    return;
  }

  // 容器样式
  body.style.cssText = `
    padding: 10px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  `;

  // 检查是否有有效的文献条目
  if (!item || !item.isRegularItem()) {
    const hint = doc.createElement("div");
    hint.style.cssText = `
      color: #9e9e9e;
      font-size: 12px;
      text-align: center;
      padding: 12px;
    `;
    hint.textContent = getString("itempane-ai-no-item");
    body.appendChild(hint);
    return;
  }

  // 渲染 PDF 解析流水线
  PdfSplitView.render(body, doc, item);
}

export default { registerItemPaneSection };
