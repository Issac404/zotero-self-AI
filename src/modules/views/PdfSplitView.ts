/**
 * ================================================================
 * PDF 发送流水线侧边栏视图
 * ================================================================
 *
 * 在 Zotero 右侧条目面板中提供「发送 PDF」按钮，
 * 触发完整的线性流水线:
 *   读取 PDF → 本地 OCR 解析 → 保存源文本笔记 → VLM 推理 → 保存 AI 笔记
 *
 * @module PdfSplitView
 * @author Self-AI Team
 */

import { PDFExtractor } from "../pdfExtractor";
import { MineruClient } from "../mineruIntegration";
import { NoteGenerator } from "../noteGenerator";
import { LLMClient } from "../llmClient";
import { getPref, setPref } from "../../utils/prefs";
import { getDefaultSummaryPrompt } from "../../utils/prompts";
import { createTextarea } from "./ui/components";

export class PdfSplitView {
  public static render(
    body: HTMLElement,
    doc: Document,
    item: Zotero.Item,
  ): void {
    const container = doc.createElement("div");
    container.className = "self-ai-pipeline-section";
    container.style.cssText = `
      margin-top: 12px;
      margin-bottom: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      overflow: visible;
      width: 100%;
      box-sizing: border-box;
      padding: 10px;
    `;

    // 标题
    const header = doc.createElement("h3");
    header.innerHTML = "🚀 PDF 解析流水线";
    header.style.cssText =
      "margin:0 0 10px 0; font-size: 13px; font-weight: normal; color: var(--ai-text, #333);";
    container.appendChild(header);

    // ========== 状态显示区与进度条 ==========
    const statusArea = doc.createElement("div");
    statusArea.style.cssText = `
      margin-top: 10px;
      padding: 8px;
      font-size: 12px;
      color: #666;
      min-height: 20px;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
    `;

    const progressBar = doc.createElement("div");
    progressBar.style.cssText = `
      margin-top: 6px;
      height: 4px;
      background: #e0e0e0;
      border-radius: 2px;
      overflow: hidden;
      display: none;
    `;
    const progressFill = doc.createElement("div");
    progressFill.style.cssText = `
      height: 100%;
      background: #59c0bc;
      border-radius: 2px;
      width: 0%;
      transition: width 0.3s ease;
    `;
    progressBar.appendChild(progressFill);

    const updateStatus = (
      text: string,
      type: "info" | "success" | "error" = "info",
    ) => {
      const colorMap = { info: "#666", success: "#4caf50", error: "#f44336" };
      statusArea.style.color = colorMap[type];
      statusArea.textContent = text;
    };

    const updateProgress = (percent: number) => {
      progressBar.style.display = "block";
      progressFill.style.width = `${percent}%`;
    };

    // ==========================================
    // 阶段一：提取 PDF 到 MD
    // ==========================================
    const stage1Div = doc.createElement("div");
    stage1Div.style.cssText =
      "margin-bottom: 12px; padding: 10px; border: 1px solid #eee; border-radius: 6px;";

    const stage1Title = doc.createElement("div");
    stage1Title.textContent = "步骤一：提取 PDF";
    stage1Title.style.cssText =
      "font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333;";
    stage1Div.appendChild(stage1Title);

    const btnMinerU = doc.createElement("button");
    btnMinerU.textContent = "📄 提取为 MD 源文档";
    btnMinerU.style.cssText = `
      width: 100%;
      padding: 8px;
      font-size: 13px;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid #59c0bc;
      background: transparent;
      color: #59c0bc;
      transition: all 0.15s ease;
    `;
    btnMinerU.addEventListener("mouseenter", () => {
      if (!btnMinerU.disabled) {
        btnMinerU.style.background = "#e0f2f1";
      }
    });
    btnMinerU.addEventListener("mouseleave", () => {
      if (!btnMinerU.disabled) {
        btnMinerU.style.background = "transparent";
      }
    });
    stage1Div.appendChild(btnMinerU);
    container.appendChild(stage1Div);

    // ==========================================
    // 阶段二：选择 MD 与生成总结
    // ==========================================
    const stage2Div = doc.createElement("div");
    stage2Div.style.cssText =
      "margin-bottom: 12px; padding: 10px; border: 1px solid #eee; border-radius: 6px;";

    const stage2Title = doc.createElement("div");
    stage2Title.textContent = "步骤二：生成 AI 总结";
    stage2Title.style.cssText =
      "font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333;";
    stage2Div.appendChild(stage2Title);

    // MD 选择
    const mdLabel = doc.createElement("label");
    mdLabel.textContent = "📑 选择 MD 源文档:";
    mdLabel.style.cssText =
      "display: block; font-size: 11px; color: #666; margin-bottom: 4px;";
    stage2Div.appendChild(mdLabel);

    const selectMD = doc.createElement("select");
    selectMD.style.cssText =
      "width: 100%; padding: 6px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;";
    stage2Div.appendChild(selectMD);

    const populateMdNotes = async () => {
      selectMD.innerHTML = "";
      const noteIds = item.getNotes();
      let hasSource = false;
      for (const noteId of noteIds) {
        const noteItem = await Zotero.Items.getAsync(noteId);
        if (!noteItem) continue;
        const rawTitle = noteItem.getField("title") as string;
        let noteTitle = rawTitle || `Note ${noteId}`;
        const isSource = noteItem.hasTag("AI-Source");
        if (isSource) noteTitle = `[AI提取] ` + noteTitle;

        const opt = doc.createElement("option");
        opt.value = String(noteId);
        opt.textContent = noteTitle;
        selectMD.appendChild(opt);

        if (isSource && !hasSource) {
          opt.selected = true;
          hasSource = true;
        }
      }
      if (selectMD.options.length === 0) {
        const opt = doc.createElement("option");
        opt.value = "";
        opt.textContent = "无可用笔记(请先执行步骤一)";
        selectMD.appendChild(opt);
      }
    };
    // Initialize MD dropdown
    populateMdNotes();

    // 提示词输入
    const promptLabel = doc.createElement("label");
    promptLabel.textContent = "📝 自定义提示词模板:";
    promptLabel.style.cssText =
      "display: block; font-size: 11px; color: #666; margin-bottom: 4px;";
    stage2Div.appendChild(promptLabel);

    const currentPrompt =
      (getPref("summaryPrompt") as string) || getDefaultSummaryPrompt();

    const promptTextarea = createTextarea(
      "pipeline-prompt-input",
      currentPrompt,
      4,
      "请输入用于总结的提示词...",
    );
    // 微调样式以适应侧边栏小空间
    Object.assign(promptTextarea.style, {
      padding: "6px",
      fontSize: "12px",
      minHeight: "80px",
      marginBottom: "10px",
    });
    // 实时保存到首选项，使输入具有持久性
    promptTextarea.addEventListener("input", () => {
      setPref("summaryPrompt", promptTextarea.value);
    });
    stage2Div.appendChild(promptTextarea);

    const btnVLM = doc.createElement("button");
    btnVLM.textContent = "🤖 生成摘要总结";
    btnVLM.style.cssText = `
      width: 100%;
      padding: 8px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      border-radius: 4px;
      border: none;
      background: #59c0bc;
      color: white;
      transition: all 0.15s ease;
    `;
    btnVLM.addEventListener("mouseenter", () => {
      if (!btnVLM.disabled) btnVLM.style.background = "#4db6ac";
    });
    btnVLM.addEventListener("mouseleave", () => {
      if (!btnVLM.disabled) btnVLM.style.background = "#59c0bc";
    });
    stage2Div.appendChild(btnVLM);
    container.appendChild(stage2Div);

    // ==========================================
    // 事件与行为逻辑
    // ==========================================

    // 阶段一点击
    btnMinerU.addEventListener("click", async () => {
      btnMinerU.disabled = true;
      btnMinerU.textContent = "⏳ 提取中...";
      btnMinerU.style.borderColor = "#999";
      btnMinerU.style.color = "#999";
      btnMinerU.style.cursor = "not-allowed";

      try {
        updateStatus("🔍 检查 PDF 附件...");
        updateProgress(5);
        const hasPdf = await PDFExtractor.hasPDFAttachment(item);
        if (!hasPdf) {
          updateStatus("❌ 该条目没有 PDF 附件", "error");
          return;
        }

        updateStatus("📤 正在提取并发送给 MinerU...");
        updateProgress(20);
        const parseResult = await MineruClient.parseLocalPdf(item);

        updateStatus(
          `✅ OCR 解码完成: 提取出 ${parseResult.markdown.length} 字符`,
          "success",
        );
        updateProgress(60);

        const markdownWithImages = MineruClient.embedImagesInMarkdown(
          parseResult.markdown,
          parseResult.images,
        );
        const itemTitle = item.getField("title") as string;
        const sourceNoteContent = NoteGenerator.formatNoteContent(
          itemTitle,
          markdownWithImages,
          "OCR 源文本",
        );

        const sourceNote = new Zotero.Item("note");
        sourceNote.libraryID = item.libraryID;
        sourceNote.parentID = item.id;
        sourceNote.setNote(sourceNoteContent);
        sourceNote.addTag("AI-Source");
        await sourceNote.saveTx();

        updateStatus("🎉 阶段一完成！已创建 MD 源文本笔记", "success");
        updateProgress(100);

        // 更新列表
        await populateMdNotes();
      } catch (err: any) {
        ztoolkit.log("[PdfSplitView] 提取 PDF 失败:", err);
        updateStatus(`❌ 失败: ${err.message}`, "error");
        updateProgress(0);
        progressBar.style.display = "none";
      } finally {
        btnMinerU.disabled = false;
        btnMinerU.textContent = "📄 提取为 MD 源文档";
        btnMinerU.style.borderColor = "#59c0bc";
        btnMinerU.style.color = "#59c0bc";
        btnMinerU.style.cursor = "pointer";
      }
    });

    // 阶段二点击
    btnVLM.addEventListener("click", async () => {
      const selectedId = selectMD.value;
      if (!selectedId) {
        updateStatus("❌ 失败: 请先选择一个可用的 MD 源文档", "error");
        return;
      }
      btnVLM.disabled = true;
      btnVLM.textContent = "⏳ 处理中...";
      btnVLM.style.background = "#999";
      btnVLM.style.cursor = "not-allowed";

      try {
        updateStatus("📥 读取且提取源笔记内容...");
        updateProgress(10);

        let markdown = "";
        const selectedImages: string[] = [];

        ztoolkit.log("[PdfSplitView] 纯粹依赖正则解析笔记原文 ...");
        const noteItem = await Zotero.Items.getAsync(parseInt(selectedId, 10));
        const rawHtml = noteItem.getNote() || "";

        // 去除绝大部分 HTML 标签保留纯文本
        markdown = rawHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

        // 仅提取 data: URI 的图像 (规避 DOM innerHTML 渲染带来的兼容性崩溃)
        const imgRegex = /src=["'](data:image\/[^;]+;base64,[^"']+)["']/gi;
        let match;
        while (
          (match = imgRegex.exec(rawHtml)) !== null &&
          selectedImages.length < 10
        ) {
          selectedImages.push(match[1]);
        }

        updateStatus(
          `🤖 正在发送内容(${markdown.length}字符, ${selectedImages.length}图片)到大模型...`,
        );
        updateProgress(30);

        // 直接从输入框获取提示词
        const summaryPrompt =
          promptTextarea.value.trim() || getDefaultSummaryPrompt();

        const contentParts: any[] = [];
        contentParts.push({
          type: "text",
          text: `${summaryPrompt}\n\n请用中文回答。\n\n<Paper>\n${markdown}\n</Paper>`,
        });

        for (const dataUri of selectedImages) {
          contentParts.push({
            type: "image_url",
            image_url: { url: dataUri },
          });
        }

        let fullResponse = "";
        const aiResult = await LLMClient.generateVisionSummary(
          contentParts,
          (chunk: string) => {
            fullResponse += chunk;
            const truncated =
              fullResponse.length > 100
                ? "..." + fullResponse.slice(-100)
                : fullResponse;
            updateStatus(`🤖 生成中: ${truncated}`);
          },
        );
        fullResponse = aiResult;

        updateStatus("💾 正在保存总结结果笔记...");
        updateProgress(85);

        const itemTitle = item.getField("title") as string;
        const aiNoteContent = NoteGenerator.formatNoteContent(
          itemTitle,
          fullResponse,
          "AI 总结",
        );
        await NoteGenerator.createNote(item, aiNoteContent);

        updateStatus("🎉 阶段二完成！AI 笔记已保存", "success");
        updateProgress(100);
      } catch (err: any) {
        ztoolkit.log("[PdfSplitView] AI 生成失败:", err);
        updateStatus(`❌ 失败: ${err.message}`, "error");
        updateProgress(0);
        progressBar.style.display = "none";
      } finally {
        btnVLM.disabled = false;
        btnVLM.textContent = "🤖 生成摘要总结";
        btnVLM.style.background = "#59c0bc";
        btnVLM.style.cursor = "pointer";
      }
    });

    container.appendChild(progressBar);
    container.appendChild(statusArea);
    body.appendChild(container);
  }
}
