'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type Mode = 'encode' | 'decode';
type OutputFormat = 'data-url' | 'raw';

interface ImageDetails {
  width: number;
  height: number;
}

interface EncodedImage extends ImageDetails {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  rawBase64: string;
  size: number;
}

interface DecodedImage extends ImageDetails {
  blob: Blob;
  mimeType: string;
  objectUrl: string;
  size: number;
}

const rawMimeOptions = [
  ['image/png', 'PNG'],
  ['image/jpeg', 'JPEG'],
  ['image/webp', 'WebP'],
  ['image/gif', 'GIF'],
  ['image/avif', 'AVIF'],
  ['image/svg+xml', 'SVG'],
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('图片读取结果无效。'));
    };
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择文件。'));
    reader.readAsDataURL(file);
  });
}

function readImageDetails(source: string) {
  return new Promise<ImageDetails>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('无法预览该图片，请确认内容和格式是否正确。'));
    image.src = source;
  });
}

function normalizedBase64(value: string) {
  const compact = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!compact) throw new Error('请先粘贴 Base64 内容。');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error('Base64 格式不正确，请检查是否复制完整。');
  }
  return compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
}

function inferImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a' ||
    bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a'
  ) return 'image/gif';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return 'image/x-icon';
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 12)) === 'ftypavif') {
    return 'image/avif';
  }
  return null;
}

function decodeBase64(value: string, fallbackMime: string) {
  const match = value.trim().match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]*)$/i);
  const declaredMime = match?.[1]?.toLowerCase() ?? fallbackMime;
  if (!declaredMime.startsWith('image/')) {
    throw new Error('Data URL 不是图片类型。');
  }

  const base64 = normalizedBase64(match?.[2] ?? value);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const estimatedBytes = (base64.length * 3) / 4 - padding;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw new Error('解码后的图片超过 15 MB，请换一张更小的图片。');
  }
  let binary: string;
  try {
    binary = window.atob(base64);
  } catch {
    throw new Error('Base64 解码失败，请检查内容是否有效。');
  }
  if (binary.length > MAX_IMAGE_BYTES) {
    throw new Error('解码后的图片超过 15 MB，请换一张更小的图片。');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const mimeType = inferImageMime(bytes) ?? declaredMime;
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function extensionForMime(mimeType: string) {
  const extensions: Record<string, string> = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/x-icon': 'ico',
  };
  return extensions[mimeType] ?? 'img';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('data-url');
  const [encodedImage, setEncodedImage] = useState<EncodedImage | null>(null);
  const [decodeInput, setDecodeInput] = useState('');
  const [rawMime, setRawMime] = useState('image/png');
  const [decodedImage, setDecodedImage] = useState<DecodedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => () => {
    if (decodedImage) URL.revokeObjectURL(decodedImage.objectUrl);
  }, [decodedImage]);

  const selectedOutput = encodedImage
    ? outputFormat === 'data-url' ? encodedImage.dataUrl : encodedImage.rawBase64
    : '';

  const showCopied = () => {
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件。');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('图片超过 15 MB，请先压缩或选择更小的图片。');
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      const details = await readImageDetails(dataUrl);
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex < 0) throw new Error('未能生成有效的 Data URL。');
      setEncodedImage({
        dataUrl,
        fileName: file.name,
        mimeType: file.type || 'image/*',
        rawBase64: dataUrl.slice(commaIndex + 1),
        size: file.size,
        ...details,
      });
    } catch (caught) {
      setEncodedImage(null);
      setError(caught instanceof Error ? caught.message : '图片转换失败。');
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  const handleDecode = async () => {
    setError(null);
    try {
      const { blob, mimeType } = decodeBase64(decodeInput, rawMime);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const details = await readImageDetails(objectUrl);
        setDecodedImage({ blob, mimeType, objectUrl, size: blob.size, ...details });
      } catch (caught) {
        URL.revokeObjectURL(objectUrl);
        throw caught;
      }
    } catch (caught) {
      setDecodedImage(null);
      setError(caught instanceof Error ? caught.message : 'Base64 解码失败。');
    }
  };

  const handleCopy = async () => {
    if (!selectedOutput) return;
    try {
      await copyText(selectedOutput);
      showCopied();
    } catch {
      setError('复制失败，请手动选择文本复制。');
    }
  };

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">图片编码</p>
          <h1>图片 Base64</h1>
          <p>在图片、Data URL 与原始 Base64 之间转换。文件只在当前浏览器处理，最大 15 MB。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />仅本地处理</span>
      </header>

      <div className="tool-tabs" role="tablist" aria-label="转换方向">
        <button
          className={mode === 'encode' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={mode === 'encode'}
          onClick={() => { setMode('encode'); setError(null); }}
        >图片转 Base64</button>
        <button
          className={mode === 'decode' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={mode === 'decode'}
          onClick={() => { setMode('decode'); setError(null); }}
        >Base64 转图片</button>
      </div>

      {error ? <div className="error-box" role="alert">{error}</div> : null}

      {mode === 'encode' ? (
        <div className="converter-layout">
          <section className="panel tool-panel" aria-labelledby="base64-upload-title">
            <div className="panel-title-row">
              <div>
                <h2 id="base64-upload-title">选择图片</h2>
                <p className="panel-description">支持 PNG、JPEG、WebP、GIF、AVIF、SVG 等浏览器可识别格式。</p>
              </div>
              {encodedImage ? (
                <button className="ghost-button" type="button" onClick={() => setEncodedImage(null)}>清空</button>
              ) : null}
            </div>

            <label
              className={`image-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              <input type="file" accept="image/*" onChange={handleFileInput} />
              <span className="dropzone-mark" aria-hidden="true">＋</span>
              <strong>{encodedImage ? '更换图片' : '点击选择或拖入图片'}</strong>
              <span>图片不会上传 · 单个文件不超过 15 MB</span>
            </label>

            {encodedImage ? (
              <div className="image-preview-card">
                {/* Data URL 来自用户本地选择的图片，使用原生 img 可避免远程图片优化请求。 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={encodedImage.dataUrl} alt={`${encodedImage.fileName} 预览`} />
                <dl className="file-metadata">
                  <div><dt>文件名</dt><dd title={encodedImage.fileName}>{encodedImage.fileName}</dd></div>
                  <div><dt>尺寸</dt><dd>{encodedImage.width} × {encodedImage.height} px</dd></div>
                  <div><dt>大小</dt><dd>{formatBytes(encodedImage.size)}</dd></div>
                  <div><dt>类型</dt><dd>{encodedImage.mimeType}</dd></div>
                </dl>
              </div>
            ) : null}
          </section>

          <section className="panel tool-panel" aria-labelledby="base64-output-title">
            <div className="panel-title-row">
              <div>
                <h2 id="base64-output-title">转换结果</h2>
                <p className="panel-description">Data URL 可直接用于网页；Raw 仅包含编码正文。</p>
              </div>
              <div className="segmented-control" aria-label="输出格式">
                <button className={outputFormat === 'data-url' ? 'active' : ''} type="button" onClick={() => setOutputFormat('data-url')}>Data URL</button>
                <button className={outputFormat === 'raw' ? 'active' : ''} type="button" onClick={() => setOutputFormat('raw')}>Raw</button>
              </div>
            </div>
            <textarea
              className="code-textarea base64-output"
              value={selectedOutput}
              readOnly
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-label="Base64 转换结果"
              placeholder="选择图片后，编码结果会显示在这里。"
            />
            <div className="tool-actions">
              <span className="result-caption">
                {selectedOutput ? `${selectedOutput.length.toLocaleString('zh-CN')} 个字符` : '等待选择图片'}
              </span>
              <button className="ghost-button" type="button" disabled={!selectedOutput} onClick={() => {
                if (!selectedOutput || !encodedImage) return;
                downloadBlob(new Blob([selectedOutput], { type: 'text/plain;charset=utf-8' }), `${encodedImage.fileName}.base64.txt`);
              }}>下载文本</button>
              <button className="primary-button" type="button" disabled={!selectedOutput} onClick={() => void handleCopy()}>
                {copied ? '已复制' : '复制结果'}
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="converter-layout">
          <section className="panel tool-panel" aria-labelledby="base64-input-title">
            <div className="panel-title-row">
              <div>
                <h2 id="base64-input-title">粘贴 Base64</h2>
                <p className="panel-description">可直接粘贴完整 Data URL，或选择类型后粘贴 Raw Base64。</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => {
                setDecodeInput('');
                setDecodedImage(null);
                setError(null);
              }}>清空</button>
            </div>
            <textarea
              className="code-textarea base64-input"
              value={decodeInput}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              onChange={(event) => { setDecodeInput(event.target.value); setDecodedImage(null); setError(null); }}
              placeholder="data:image/png;base64,iVBORw0KGgo…"
              aria-label="待解码的 Base64"
            />
            <div className="tool-actions base64-decode-actions">
              <label className="inline-field" htmlFor="raw-image-mime">
                <span>Raw 图片类型</span>
                <select id="raw-image-mime" value={rawMime} onChange={(event) => setRawMime(event.target.value)}>
                  {rawMimeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button className="primary-button" type="button" disabled={!decodeInput.trim()} onClick={() => void handleDecode()}>解码并预览</button>
            </div>
          </section>

          <section className="panel tool-panel" aria-labelledby="decoded-image-title">
            <div className="panel-title-row">
              <div>
                <h2 id="decoded-image-title">图片预览</h2>
                <p className="panel-description">解码成功后可查看元数据并下载原始结果。</p>
              </div>
            </div>
            {decodedImage ? (
              <div className="decoded-preview">
                {/* 对象 URL 指向当前浏览器内解码得到的 Blob。 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={decodedImage.objectUrl} alt="Base64 解码图片预览" />
                <dl className="file-metadata compact">
                  <div><dt>尺寸</dt><dd>{decodedImage.width} × {decodedImage.height} px</dd></div>
                  <div><dt>大小</dt><dd>{formatBytes(decodedImage.size)}</dd></div>
                  <div><dt>类型</dt><dd>{decodedImage.mimeType}</dd></div>
                </dl>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => downloadBlob(decodedImage.blob, `decoded.${extensionForMime(decodedImage.mimeType)}`)}
                >下载图片</button>
              </div>
            ) : (
              <div className="empty-result">
                <span aria-hidden="true">▧</span>
                <strong>等待解码</strong>
                <p>粘贴有效内容后点击“解码并预览”。</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
