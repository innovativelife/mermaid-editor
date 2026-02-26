import { useRef, useEffect, useCallback } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
})

export default function MermaidPanel({ code, showPreview }) {
  const previewRef = useRef(null)

  useEffect(() => {
    if (!showPreview || !code || !previewRef.current) return
    let cancelled = false

    async function render() {
      try {
        const { svg } = await mermaid.render('mermaid-preview', code)
        if (!cancelled && previewRef.current) {
          previewRef.current.innerHTML = svg
        }
      } catch {
        if (!cancelled && previewRef.current) {
          previewRef.current.innerHTML = '<p class="preview-error">Invalid diagram syntax</p>'
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [code, showPreview])

  const copyToClipboard = useCallback(() => {
    const md = '```mermaid\n' + code + '\n```'
    navigator.clipboard.writeText(md)
  }, [code])

  const downloadMd = useCallback(() => {
    const md = '```mermaid\n' + code + '\n```'
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diagram.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [code])

  const copyRaw = useCallback(() => {
    navigator.clipboard.writeText(code)
  }, [code])

  return (
    <div className="mermaid-panel">
      <div className="panel-header">
        <h3>Mermaid Output</h3>
        <div className="panel-actions">
          <button className="btn btn-sm" onClick={copyRaw} disabled={!code} title="Copy raw mermaid syntax">
            Copy Raw
          </button>
          <button className="btn btn-sm" onClick={copyToClipboard} disabled={!code} title="Copy as markdown code block">
            Copy MD
          </button>
          <button className="btn btn-sm btn-primary" onClick={downloadMd} disabled={!code} title="Download as .md file">
            Export .md
          </button>
        </div>
      </div>
      <pre className="code-output"><code>{code || '(add nodes to generate mermaid code)'}</code></pre>
      {showPreview && (
        <div className="preview-section">
          <h4>Live Preview</h4>
          <div ref={previewRef} className="mermaid-preview" />
        </div>
      )}
    </div>
  )
}
