/**
 * ================================================================
 * MinerU 本地 OCR 交互模块
 * ================================================================
 *
 * 本模块提供与本地部署的 MinerU 服务的交互功能
 *
 * 主要职责: 将 PDF 发送到本地 MinerU 服务器，取回解析出的
 *           Markdown 全文以及 md 中引用的切片图片
 *
 * 技术实现:
 * - 使用 multipart/form-data 上传 PDF 到本地 MinerU 服务
 * - 通过 response_format_zip 参数获取 ZIP 压缩包响应
 * - 使用 Zotero (Firefox) 内置的 nsIZipReader 解压 ZIP
 * - 返回 Markdown 内容和图片 Map
 *
 * @module mineruIntegration
 * @author Self-AI Team
 */

import { getPref } from "../utils/prefs";
import { PDFExtractor } from "./pdfExtractor";

/**
 * MinerU 解析结果
 */
export interface MineruParseResult {
  /** 解析出的 Markdown 全文 */
  markdown: string;
  /** 图片映射: 文件名 -> 二进制数据 */
  images: Map<string, Uint8Array>;
}

/**
 * MinerU 本地服务客户端
 *
 * 调用逻辑:
 * 1. 从条目获取最早的 PDF 附件
 * 2. 读取 PDF 二进制
 * 3. 以 multipart/form-data 上传到本地 MinerU 服务
 * 4. 接收 ZIP 响应并用 nsIZipReader 解压
 * 5. 提取 Markdown 和图片
 *
 * @throws 当任何步骤失败时抛出错误
 */
export class MineruClient {
  /**
   * 从 Zotero 条目解析 PDF，返回 Markdown + 图片
   */
  public static async parseLocalPdf(
    item: Zotero.Item,
  ): Promise<MineruParseResult> {
    const serverUrl = (
      (getPref("mineruServerUrl" as any) as string) ||
      "http://192.168.137.11:18000"
    ).replace(/\/$/, "");

    if (!serverUrl) {
      throw new Error("MinerU 服务器地址未配置");
    }

    // 获取最早添加的 PDF 附件
    const pdfAttachments = await PDFExtractor.getAllPdfAttachments(item);
    if (!pdfAttachments || pdfAttachments.length === 0) {
      throw new Error("未找到 PDF 附件");
    }
    const pdfAttachment = pdfAttachments[0];
    const filePath = await pdfAttachment.getFilePathAsync();
    if (!filePath) {
      throw new Error("无法获取 PDF 文件路径");
    }

    ztoolkit.log(`[MineruIntegration] 开始发送 PDF 到本地 MinerU: ${filePath}`);

    // 读取 PDF 二进制
    const fileData = await IOUtils.read(filePath);

    // 构建 multipart/form-data
    const boundary =
      "----ZoteroSelfAI" +
      Date.now().toString(36) +
      Math.random().toString(36);
    const fileName = filePath.split(/[/\\]/).pop() || "document.pdf";

    // 组装 multipart body
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // PDF 文件 part
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n` +
          `Content-Type: application/pdf\r\n\r\n`,
      ),
    );
    parts.push(fileData);
    parts.push(encoder.encode("\r\n"));

    // return_md 参数
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="return_md"\r\n\r\n` +
          `true\r\n`,
      ),
    );

    // return_images 参数
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="return_images"\r\n\r\n` +
          `true\r\n`,
      ),
    );

    // response_format_zip 参数
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="response_format_zip"\r\n\r\n` +
          `true\r\n`,
      ),
    );

    // 结束标记
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    // 合并所有 parts 为一个 Uint8Array
    const totalLength = parts.reduce((acc, p) => acc + p.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    // 发送请求
    const apiUrl = `${serverUrl}/file_parse`;
    ztoolkit.log(`[MineruIntegration] POST ${apiUrl}`);

    let response: any;
    try {
      response = await Zotero.HTTP.request("POST", apiUrl, {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
        responseType: "arraybuffer",
        timeout: 600000, // 10 分钟超时，OCR 可能很慢
      });
    } catch (err: any) {
      throw new Error(`MinerU 服务请求失败: ${err.message || err}`);
    }

    if (response.status !== 200) {
      throw new Error(`MinerU 服务返回错误状态码: ${response.status}`);
    }

    // 检查响应类型
    const contentType: string =
      response.getResponseHeader?.("Content-Type") || "";

    if (
      !contentType.includes("application/zip") &&
      !contentType.includes("application/x-zip-compressed") &&
      !contentType.includes("application/octet-stream")
    ) {
      // 可能返回了 JSON 错误
      try {
        const textDecoder = new TextDecoder();
        const text = textDecoder.decode(response.response);
        const json = JSON.parse(text);
        throw new Error(`MinerU 服务返回非 ZIP 响应: ${JSON.stringify(json)}`);
      } catch (e: any) {
        if (e.message.startsWith("MinerU")) throw e;
        throw new Error(
          `MinerU 服务返回未知格式, Content-Type: ${contentType}`,
        );
      }
    }

    // 将 ZIP 数据写入临时文件，然后用 nsIZipReader 解压
    const zipData = new Uint8Array(response.response);
    ztoolkit.log(
      `[MineruIntegration] 收到 ZIP 数据, 大小: ${zipData.byteLength} bytes`,
    );

    return await this.extractZipContent(zipData);
  }

  /**
   * 使用 nsIZipReader 解压 ZIP 数据，提取 Markdown 和图片
   */
  private static async extractZipContent(
    zipData: Uint8Array,
  ): Promise<MineruParseResult> {
    // 将 ZIP 写入临时文件
    const tmpDir = Zotero.getTempDirectory();
    const tmpZipPath = PathUtils.join(tmpDir.path, `mineru_${Date.now()}.zip`);

    await IOUtils.write(tmpZipPath, zipData);
    ztoolkit.log(`[MineruIntegration] ZIP 临时文件已保存到: ${tmpZipPath}`);

    let markdown = "";
    const images = new Map<string, Uint8Array>();

    try {
      // 使用 nsIZipReader
      const zipReader = (Components.classes as any)[
        "@mozilla.org/libjar/zip-reader;1"
      ].createInstance(Components.interfaces.nsIZipReader);

      const zipFile = (Components.classes as any)[
        "@mozilla.org/file/local;1"
      ].createInstance(Components.interfaces.nsIFile);
      zipFile.initWithPath(tmpZipPath);

      zipReader.open(zipFile);

      try {
        // 遍历 ZIP 中的所有条目
        const entries = zipReader.findEntries("*");

        while (entries.hasMore()) {
          const entryName: string = entries.getNext();

          // 跳过目录和 macOS 元数据
          if (entryName.endsWith("/") || entryName.includes("__MACOSX")) {
            continue;
          }

          // 读取条目内容
          const inputStream = zipReader.getInputStream(entryName);
          const binaryStream = (Components.classes as any)[
            "@mozilla.org/binaryinputstream;1"
          ].createInstance(Components.interfaces.nsIBinaryInputStream);
          binaryStream.setInputStream(inputStream);

          const available = binaryStream.available();
          const bytes = binaryStream.readBytes(available);
          binaryStream.close();
          inputStream.close();

          // 将 byte string 转为 Uint8Array
          const uint8 = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) {
            uint8[i] = bytes.charCodeAt(i);
          }

          if (entryName.endsWith(".md")) {
            // Markdown 文件
            const decoder = new TextDecoder("utf-8");
            markdown = decoder.decode(uint8);

            // 去除公式中的 \tag{编号}
            markdown = markdown.replace(/\\tag\s*\{[^}]*\}/g, "");

            ztoolkit.log(
              `[MineruIntegration] 提取 Markdown: ${entryName}, 长度: ${markdown.length}`,
            );
          } else if (entryName.match(/\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i)) {
            // 图片文件：使用文件名作为 key
            const imgName = entryName.split("/").pop() || entryName;
            images.set(imgName, uint8);
            ztoolkit.log(
              `[MineruIntegration] 提取图片: ${imgName}, 大小: ${uint8.byteLength}`,
            );
          }
        }
      } finally {
        zipReader.close();
      }
    } finally {
      // 清理临时 ZIP 文件
      try {
        await IOUtils.remove(tmpZipPath);
      } catch {
        // 忽略清理失败
      }
    }

    if (!markdown) {
      throw new Error("ZIP 中未找到 Markdown 文件");
    }

    ztoolkit.log(
      `[MineruIntegration] 解析完成: Markdown ${markdown.length} 字符, ${images.size} 张图片`,
    );

    return { markdown, images };
  }

  /**
   * 将图片 Uint8Array 转为 base64 字符串
   */
  public static imageToBase64(data: Uint8Array): string {
    let binary = "";
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(
        null,
        data.subarray(i, i + CHUNK_SIZE) as any,
      );
    }
    return btoa(binary);
  }

  /**
   * 根据文件扩展名推断 MIME 类型
   */
  public static getMimeType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      bmp: "image/bmp",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    return mimeMap[ext] || "image/png";
  }

  /**
   * 在 Markdown 中将图片引用替换为 base64 data URI
   *
   * @param markdown Markdown 文本
   * @param images 图片映射
   * @returns 替换后的 Markdown
   */
  public static embedImagesInMarkdown(
    markdown: string,
    images: Map<string, Uint8Array>,
  ): string {
    let result = markdown;

    for (const [imgName, imgData] of images) {
      const base64 = this.imageToBase64(imgData);
      const mimeType = this.getMimeType(imgName);
      const dataUri = `data:${mimeType};base64,${base64}`;

      // 替换 Markdown 中所有引用该图片的路径
      // 匹配模式: ![xxx](images/imgName) 或 ![xxx](./images/imgName) 或 ![xxx](imgName)
      const escapedName = imgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(!\\[[^\\]]*\\]\\()(?:[^)]*?/)?${escapedName}(\\))`,
        "g",
      );
      result = result.replace(pattern, `$1${dataUri}$2`);
    }

    return result;
  }

  /**
   * 筛选最重要的图片（按文件大小降序，取前 maxCount 张）
   *
   * 较大的图片通常包含更有价值的信息（如图表、示意图），
   * 而较小的图片可能是装饰性的图标或小元素。
   *
   * @param images 图片映射
   * @param maxCount 最大保留数量
   * @returns 筛选后的图片映射
   */
  public static selectImportantImages(
    images: Map<string, Uint8Array>,
    maxCount: number = 10,
  ): Map<string, Uint8Array> {
    if (images.size <= maxCount) {
      return images;
    }

    // 按文件大小降序排序
    const sorted = Array.from(images.entries()).sort(
      (a, b) => b[1].byteLength - a[1].byteLength,
    );

    const selected = new Map<string, Uint8Array>();
    for (let i = 0; i < Math.min(maxCount, sorted.length); i++) {
      selected.set(sorted[i][0], sorted[i][1]);
    }

    ztoolkit.log(
      `[MineruIntegration] 从 ${images.size} 张图片中筛选了 ${selected.size} 张重要图片`,
    );

    return selected;
  }
}
