import { useState, useEffect, useRef } from 'react'

const SHAPES = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'round', label: 'Rounded' },
  { value: 'stadium', label: 'Stadium' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'circle', label: 'Circle' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'subroutine', label: 'Subroutine' },
]

const SIZE_PRESETS = [
  { value: 'S', label: 'Small', width: 100, height: 40 },
  { value: 'M', label: 'Medium', width: 140, height: 50 },
  { value: 'L', label: 'Large', width: 200, height: 70 },
  { value: 'XL', label: 'X-Large', width: 280, height: 100 },
  { value: 'custom', label: 'Custom' },
]

const FILL_COLORS = [
  { value: null, label: 'Default', css: null },
  { value: '#dbeafe', label: 'Blue', css: '#dbeafe' },
  { value: '#dcfce7', label: 'Green', css: '#dcfce7' },
  { value: '#fef9c3', label: 'Yellow', css: '#fef9c3' },
  { value: '#fce7f3', label: 'Pink', css: '#fce7f3' },
  { value: '#f3e8ff', label: 'Purple', css: '#f3e8ff' },
  { value: '#ffedd5', label: 'Orange', css: '#ffedd5' },
  { value: '#f1f5f9', label: 'Gray', css: '#f1f5f9' },
  { value: '#e0f2fe', label: 'Cyan', css: '#e0f2fe' },
  { value: '#fef2f2', label: 'Red', css: '#fef2f2' },
]

const BORDER_COLORS = [
  { value: null, label: 'Default', css: null },
  { value: '#2563eb', label: 'Blue', css: '#2563eb' },
  { value: '#16a34a', label: 'Green', css: '#16a34a' },
  { value: '#dc2626', label: 'Red', css: '#dc2626' },
  { value: '#ea580c', label: 'Orange', css: '#ea580c' },
  { value: '#9333ea', label: 'Purple', css: '#9333ea' },
  { value: '#0891b2', label: 'Cyan', css: '#0891b2' },
  { value: '#475569', label: 'Slate', css: '#475569' },
  { value: '#ca8a04', label: 'Gold', css: '#ca8a04' },
  { value: '#e11d48', label: 'Rose', css: '#e11d48' },
]

const BORDER_WIDTHS = [
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'thick', label: 'Thick' },
]

const TEXT_POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

export default function Toolbar({
  selectedNode, selectedEdge, selectedContainer,
  onUpdateNode, onDeleteNode,
  onUpdateEdge, onDeleteEdge,
  onUpdateContainer, onDeleteContainer,
  connectingFrom, onCancelConnect,
  creatingContainer, onToggleCreatingContainer,
}) {
  const [editingLabel, setEditingLabel] = useState(null)
  const [editingEdgeLabel, setEditingEdgeLabel] = useState(null)
  const [editingContainerLabel, setEditingContainerLabel] = useState(null)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const nodeLabelRef = useRef(null)
  const edgeLabelRef = useRef(null)
  const containerLabelRef = useRef(null)
  const prevNodeId = useRef(null)
  const prevEdgeId = useRef(null)
  const prevContainerId = useRef(null)

  // Auto-focus node label input when a new node is selected
  useEffect(() => {
    if (selectedNode && selectedNode.id !== prevNodeId.current) {
      prevNodeId.current = selectedNode.id
      setEditingLabel(selectedNode.label)
      requestAnimationFrame(() => {
        nodeLabelRef.current?.focus()
        nodeLabelRef.current?.select()
      })
    } else if (!selectedNode) {
      prevNodeId.current = null
    }
  }, [selectedNode])

  // Auto-focus edge label input when a new edge is selected
  useEffect(() => {
    if (selectedEdge && selectedEdge.id !== prevEdgeId.current) {
      prevEdgeId.current = selectedEdge.id
      setEditingEdgeLabel(selectedEdge.label)
      requestAnimationFrame(() => {
        edgeLabelRef.current?.focus()
        edgeLabelRef.current?.select()
      })
    } else if (!selectedEdge) {
      prevEdgeId.current = null
    }
  }, [selectedEdge])

  // Auto-focus container label input when a new container is selected
  useEffect(() => {
    if (selectedContainer && selectedContainer.id !== prevContainerId.current) {
      prevContainerId.current = selectedContainer.id
      setEditingContainerLabel(selectedContainer.label)
      requestAnimationFrame(() => {
        containerLabelRef.current?.focus()
        containerLabelRef.current?.select()
      })
    } else if (!selectedContainer) {
      prevContainerId.current = null
    }
  }, [selectedContainer])

  // Delete/Backspace key deletes selected container
  useEffect(() => {
    const handler = (e) => {
      // Don't delete when typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedContainer) {
        onDeleteContainer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedContainer, onDeleteContainer])

  const commitNodeLabel = () => {
    if (editingLabel !== null) {
      onUpdateNode({ label: editingLabel || selectedNode?.id || 'Node' })
    }
    setEditingLabel(null)
  }

  const handleNodeLabelKey = (e) => {
    if (e.key === 'Enter') commitNodeLabel()
  }

  const commitEdgeLabel = () => {
    if (editingEdgeLabel !== null) {
      onUpdateEdge({ label: editingEdgeLabel })
    }
    setEditingEdgeLabel(null)
  }

  const handleEdgeLabelKey = (e) => {
    if (e.key === 'Enter') commitEdgeLabel()
  }

  const commitContainerLabel = () => {
    if (editingContainerLabel !== null) {
      onUpdateContainer({ label: editingContainerLabel || 'Group' })
    }
    setEditingContainerLabel(null)
  }

  const handleContainerLabelKey = (e) => {
    if (e.key === 'Enter') commitContainerLabel()
  }

  const handleSizeChange = (presetValue) => {
    if (presetValue === 'custom') {
      onUpdateNode({ sizePreset: 'custom' })
      return
    }
    const preset = SIZE_PRESETS.find(p => p.value === presetValue)
    if (preset) {
      onUpdateNode({ sizePreset: presetValue, width: preset.width, height: preset.height })
    }
  }

  const applyCustomSize = () => {
    const w = parseInt(customW)
    const h = parseInt(customH)
    if (w > 0 && h > 0) {
      onUpdateNode({ width: w, height: h, sizePreset: 'custom' })
    }
  }

  const handleCustomKey = (e) => {
    if (e.key === 'Enter') applyCustomSize()
  }

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button
          className={`btn btn-container ${creatingContainer ? 'active' : ''}`}
          onClick={onToggleCreatingContainer}
        >
          + Add Container
        </button>
      </div>

      <div className="toolbar-section">
        <h3>Instructions</h3>
        <ul className="instructions">
          <li><strong>Double-click</strong> canvas to add node</li>
          <li><strong>Click</strong> node to select</li>
          <li><strong>Drag</strong> node to move</li>
          <li><strong>Drag</strong> from a port to connect</li>
          <li><strong>Click</strong> edge line to select</li>
          <li><strong>Drag</strong> edge diamonds to move ports</li>
        </ul>
      </div>

      {connectingFrom && (
        <div className="toolbar-section connecting-hint">
          <p>Click a target node to connect from <strong>{connectingFrom}</strong></p>
          <button className="btn btn-cancel" onClick={onCancelConnect}>Cancel</button>
        </div>
      )}

      {selectedNode && (
        <div className="toolbar-section">
          <h3>Node: {selectedNode.id}</h3>
          <label>
            Label:
            <input
              ref={nodeLabelRef}
              type="text"
              value={editingLabel !== null ? editingLabel : selectedNode.label}
              onFocus={() => setEditingLabel(selectedNode.label)}
              onChange={e => setEditingLabel(e.target.value)}
              onBlur={commitNodeLabel}
              onKeyDown={handleNodeLabelKey}
            />
          </label>
          <label>
            Shape:
            <select
              value={selectedNode.shape}
              onChange={e => onUpdateNode({ shape: e.target.value })}
            >
              {SHAPES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Size:
            <select
              value={selectedNode.sizePreset || 'M'}
              onChange={e => handleSizeChange(e.target.value)}
            >
              {SIZE_PRESETS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {(selectedNode.sizePreset === 'custom') && (
            <div className="custom-size">
              <label>
                W:
                <input
                  type="text"
                  value={customW || selectedNode.width}
                  onFocus={() => setCustomW(String(selectedNode.width))}
                  onChange={e => setCustomW(e.target.value)}
                  onBlur={applyCustomSize}
                  onKeyDown={handleCustomKey}
                />
              </label>
              <label>
                H:
                <input
                  type="text"
                  value={customH || selectedNode.height}
                  onFocus={() => setCustomH(String(selectedNode.height))}
                  onChange={e => setCustomH(e.target.value)}
                  onBlur={applyCustomSize}
                  onKeyDown={handleCustomKey}
                />
              </label>
            </div>
          )}
          <label>
            Fill:
            <div className="color-swatches">
              {FILL_COLORS.map(c => (
                <button
                  key={c.label}
                  className={`swatch ${(selectedNode.fillColor || null) === c.value ? 'active' : ''}`}
                  style={{ background: c.css || 'var(--node-fill)', borderColor: c.value === null ? 'var(--text-muted)' : c.css }}
                  title={c.label}
                  onClick={() => onUpdateNode({ fillColor: c.value })}
                />
              ))}
            </div>
          </label>
          <label>
            Border:
            <div className="color-swatches">
              {BORDER_COLORS.map(c => (
                <button
                  key={c.label}
                  className={`swatch ${(selectedNode.borderColor || null) === c.value ? 'active' : ''}`}
                  style={{ background: c.css || 'var(--node-stroke)', borderColor: c.value === null ? 'var(--text-muted)' : c.css }}
                  title={c.label}
                  onClick={() => onUpdateNode({ borderColor: c.value })}
                />
              ))}
            </div>
          </label>
          <label>
            Border Width:
            <div className="border-width-btns">
              {BORDER_WIDTHS.map(w => (
                <button
                  key={w.value}
                  className={`btn btn-sm ${(selectedNode.borderWidth || 'medium') === w.value ? 'btn-primary' : ''}`}
                  onClick={() => onUpdateNode({ borderWidth: w.value })}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </label>
          <div className="toolbar-actions">
            <button
              className="btn btn-connect"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('start-connect', { detail: selectedNode.id }))
              }}
            >
              Connect From
            </button>
            <button className="btn btn-delete" onClick={onDeleteNode}>Delete</button>
          </div>
        </div>
      )}

      {selectedEdge && (
        <div className="toolbar-section">
          <h3>Edge: {selectedEdge.from} &rarr; {selectedEdge.to}</h3>
          <label>
            Label:
            <input
              ref={edgeLabelRef}
              type="text"
              value={editingEdgeLabel !== null ? editingEdgeLabel : selectedEdge.label}
              onFocus={() => setEditingEdgeLabel(selectedEdge.label)}
              onChange={e => setEditingEdgeLabel(e.target.value)}
              onBlur={commitEdgeLabel}
              onKeyDown={handleEdgeLabelKey}
            />
          </label>
          {(selectedEdge.fromPort || selectedEdge.toPort) && (
            <div className="port-status">
              {selectedEdge.fromPort && (
                <span className="port-pin">From: {selectedEdge.fromPort.side}</span>
              )}
              {selectedEdge.toPort && (
                <span className="port-pin">To: {selectedEdge.toPort.side}</span>
              )}
            </div>
          )}
          <div className="toolbar-actions">
            {(selectedEdge.fromPort || selectedEdge.toPort) && (
              <button
                className="btn btn-reset"
                onClick={() => onUpdateEdge({ fromPort: null, toPort: null })}
                title="Reset connection points to auto"
              >
                Reset Ports
              </button>
            )}
            <button className="btn btn-delete" onClick={onDeleteEdge}>Delete</button>
          </div>
        </div>
      )}

      {selectedContainer && (
        <div className="toolbar-section">
          <h3>Container: {selectedContainer.id}</h3>
          <label>
            Label:
            <input
              ref={containerLabelRef}
              type="text"
              value={editingContainerLabel !== null ? editingContainerLabel : selectedContainer.label}
              onFocus={() => setEditingContainerLabel(selectedContainer.label)}
              onChange={e => setEditingContainerLabel(e.target.value)}
              onBlur={commitContainerLabel}
              onKeyDown={handleContainerLabelKey}
            />
          </label>
          <label>
            Text Position:
            <select
              value={selectedContainer.textPosition || 'top'}
              onChange={e => onUpdateContainer({ textPosition: e.target.value })}
            >
              {TEXT_POSITIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Fill:
            <div className="color-swatches">
              {FILL_COLORS.map(c => (
                <button
                  key={c.label}
                  className={`swatch ${(selectedContainer.fillColor || null) === c.value ? 'active' : ''}`}
                  style={{ background: c.css || 'rgba(148, 163, 184, 0.06)', borderColor: c.value === null ? 'var(--text-muted)' : c.css }}
                  title={c.label}
                  onClick={() => onUpdateContainer({ fillColor: c.value })}
                />
              ))}
            </div>
          </label>
          <label>
            Border:
            <div className="color-swatches">
              {BORDER_COLORS.map(c => (
                <button
                  key={c.label}
                  className={`swatch ${(selectedContainer.borderColor || null) === c.value ? 'active' : ''}`}
                  style={{ background: c.css || '#475569', borderColor: c.value === null ? 'var(--text-muted)' : c.css }}
                  title={c.label}
                  onClick={() => onUpdateContainer({ borderColor: c.value })}
                />
              ))}
            </div>
          </label>
          <label>
            Border Width:
            <div className="border-width-btns">
              {BORDER_WIDTHS.map(w => (
                <button
                  key={w.value}
                  className={`btn btn-sm ${(selectedContainer.borderWidth || 'medium') === w.value ? 'btn-primary' : ''}`}
                  onClick={() => onUpdateContainer({ borderWidth: w.value })}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </label>
          <div className="toolbar-actions">
            <button className="btn btn-delete" onClick={onDeleteContainer}>Delete</button>
          </div>
        </div>
      )}

      {!selectedNode && !selectedEdge && !selectedContainer && !connectingFrom && (
        <div className="toolbar-section">
          <p className="muted">Select a node, edge, or container to edit its properties.</p>
        </div>
      )}
    </div>
  )
}
