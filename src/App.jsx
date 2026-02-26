import { useState, useCallback, useEffect, useRef } from 'react'
import DiagramCanvas from './components/DiagramCanvas'
import Toolbar from './components/Toolbar'
import MermaidPanel from './components/MermaidPanel'
import { generateMermaid } from './utils/mermaidGenerator'
import './App.css'

let nextNodeId = 1
let nextEdgeId = 1
let nextContainerId = 1

const LS_KEY = 'mde-saved-diagrams'

function getSavedList() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch { return {} }
}

function serializeDiagram(nodes, edges, containers, direction, type) {
  return JSON.stringify({ version: 2, nodes, edges, containers, direction, type }, null, 2)
}

function deserializeDiagram(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  if (!data.nodes || !data.edges) throw new Error('Invalid diagram file')
  // v1 backward compat: default containers to []
  if (!data.containers) data.containers = []
  return data
}

export default function App() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [containers, setContainers] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [selectedContainer, setSelectedContainer] = useState(null)
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [creatingContainer, setCreatingContainer] = useState(false)
  const [diagramDirection, setDiagramDirection] = useState('TD')
  const [diagramType, setDiagramType] = useState('flowchart')
  const [showPreview, setShowPreview] = useState(false)

  // Dirty tracking — true when there are unsaved changes
  const [dirty, setDirty] = useState(false)

  // Dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [diagramName, setDiagramName] = useState('')
  const saveInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const pendingActionRef = useRef(null)

  const loadDiagram = useCallback((data) => {
    const d = deserializeDiagram(data)
    setNodes(d.nodes)
    setEdges(d.edges)
    setContainers(d.containers)
    if (d.direction) setDiagramDirection(d.direction)
    if (d.type) setDiagramType(d.type)
    setSelectedNode(null)
    setSelectedEdge(null)
    setSelectedContainer(null)
    setConnectingFrom(null)
    setCreatingContainer(false)
    // Reset ID counters past the highest existing IDs
    const maxN = d.nodes.reduce((m, n) => {
      const num = parseInt(n.id.replace(/\D/g, '')) || 0
      return Math.max(m, num)
    }, 0)
    const maxE = d.edges.reduce((m, e) => {
      const num = parseInt(e.id.replace(/\D/g, '')) || 0
      return Math.max(m, num)
    }, 0)
    const maxC = d.containers.reduce((m, c) => {
      const num = parseInt(c.id.replace(/\D/g, '')) || 0
      return Math.max(m, num)
    }, 0)
    nextNodeId = maxN + 1
    nextEdgeId = maxE + 1
    nextContainerId = maxC + 1
  }, [])

  // ── Three-way mutual exclusion for selection ──────────────
  const selectNode = useCallback((id) => {
    setSelectedNode(id)
    setSelectedEdge(null)
    setSelectedContainer(null)
  }, [])

  const selectEdge = useCallback((id) => {
    setSelectedEdge(id)
    setSelectedNode(null)
    setSelectedContainer(null)
  }, [])

  const selectContainer = useCallback((id) => {
    setSelectedContainer(id)
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
    setSelectedContainer(null)
    setConnectingFrom(null)
  }, [])

  const addNode = useCallback((x, y) => {
    const id = `N${nextNodeId++}`
    setNodes(prev => [...prev, {
      id,
      label: id,
      x,
      y,
      width: 140,
      height: 50,
      shape: 'rect',
      sizePreset: 'M',
      fillColor: null,
      borderColor: null,
      borderWidth: 'medium',
      containerId: null,
    }])
    selectNode(id)
  }, [selectNode])

  const updateNode = useCallback((id, updates) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
  }, [])

  const deleteNode = useCallback((id) => {
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    setSelectedNode(null)
  }, [])

  const addEdge = useCallback((from, to) => {
    if (from === to) return
    const id = `E${nextEdgeId++}`
    setEdges(prev => [...prev, { id, from, to, label: '', fromPort: null, toPort: null }])
    selectEdge(id)
  }, [selectEdge])

  const updateEdge = useCallback((id, updates) => {
    setEdges(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }, [])

  const deleteEdge = useCallback((id) => {
    setEdges(prev => prev.filter(e => e.id !== id))
    setSelectedEdge(null)
  }, [])

  // ── Container CRUD ──────────────────────────────────────
  const addContainer = useCallback((x, y, width, height) => {
    const id = `C${nextContainerId++}`
    setContainers(prev => [...prev, {
      id,
      label: 'Group',
      x,
      y,
      width,
      height,
      textPosition: 'top',
      fillColor: null,
      borderColor: null,
      borderWidth: 'medium',
    }])
    selectContainer(id)
  }, [selectContainer])

  const updateContainer = useCallback((id, updates) => {
    setContainers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [])

  const deleteContainer = useCallback((id) => {
    // Clear containerId from nodes that were inside this container
    setNodes(prev => prev.map(n => n.containerId === id ? { ...n, containerId: null } : n))
    setContainers(prev => prev.filter(c => c.id !== id))
    setSelectedContainer(null)
  }, [])

  const clearAll = useCallback(() => {
    setNodes([])
    setEdges([])
    setContainers([])
    setSelectedNode(null)
    setSelectedEdge(null)
    setSelectedContainer(null)
    setConnectingFrom(null)
    setCreatingContainer(false)
    setDiagramName('')
    setDirty(false)
    nextNodeId = 1
    nextEdgeId = 1
    nextContainerId = 1
  }, [])

  useEffect(() => {
    const handler = (e) => setConnectingFrom(e.detail)
    window.addEventListener('start-connect', handler)
    return () => window.removeEventListener('start-connect', handler)
  }, [])

  // Mark dirty when diagram content changes
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0 || containers.length > 0) setDirty(true)
  }, [nodes, edges, containers])

  // Warn on refresh/close with unsaved work
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // ── Guard unsaved changes ────────────────────────────────
  const guardUnsaved = (action) => {
    if (dirty) {
      pendingActionRef.current = action
      setShowUnsavedWarning(true)
    } else {
      action()
    }
  }

  const quickSave = () => {
    if (!diagramName) return false
    const saved = getSavedList()
    saved[diagramName] = {
      data: serializeDiagram(nodes, edges, containers, diagramDirection, diagramType),
      date: new Date().toISOString(),
    }
    localStorage.setItem(LS_KEY, JSON.stringify(saved))
    setDirty(false)
    return true
  }

  const handleUnsavedSave = () => {
    setShowUnsavedWarning(false)
    if (diagramName) {
      quickSave()
      pendingActionRef.current?.()
      pendingActionRef.current = null
    } else {
      // No name yet — open save dialog; pending action runs after save completes
      setSaveName('')
      setShowSaveDialog(true)
      requestAnimationFrame(() => saveInputRef.current?.focus())
    }
  }

  const handleUnsavedDiscard = () => {
    setShowUnsavedWarning(false)
    setDirty(false)
    pendingActionRef.current?.()
    pendingActionRef.current = null
  }

  const handleUnsavedCancel = () => {
    setShowUnsavedWarning(false)
    pendingActionRef.current = null
  }

  // ── Save to localStorage ─────────────────────────────────
  const handleSave = () => {
    if (!saveName.trim()) return
    const name = saveName.trim()
    const saved = getSavedList()
    saved[name] = {
      data: serializeDiagram(nodes, edges, containers, diagramDirection, diagramType),
      date: new Date().toISOString(),
    }
    localStorage.setItem(LS_KEY, JSON.stringify(saved))
    setDiagramName(name)
    setDirty(false)
    setShowSaveDialog(false)
    setSaveName('')
    // Run pending action if save was triggered from unsaved warning
    if (pendingActionRef.current) {
      pendingActionRef.current()
      pendingActionRef.current = null
    }
  }

  // ── Open from localStorage ───────────────────────────────
  const handleOpenSaved = (name) => {
    const doOpen = () => {
      const saved = getSavedList()
      if (saved[name]) {
        loadDiagram(saved[name].data)
        setDiagramName(name)
        setDirty(false)
      }
      setShowOpenDialog(false)
    }
    guardUnsaved(doOpen)
  }

  const handleDeleteSaved = (name) => {
    const saved = getSavedList()
    delete saved[name]
    localStorage.setItem(LS_KEY, JSON.stringify(saved))
    // Force re-render by toggling dialog
    setShowOpenDialog(false)
    requestAnimationFrame(() => setShowOpenDialog(true))
  }

  // ── Export to .mde file ──────────────────────────────────
  const handleExport = () => {
    const json = serializeDiagram(nodes, edges, containers, diagramDirection, diagramType)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (diagramName || 'diagram') + '.mde'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import from .mde file ───────────────────────────────
  const handleFileOpen = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Read the file content immediately (before input resets)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target.result
      const doOpen = () => {
        try {
          loadDiagram(content)
          const name = file.name.replace(/\.mde$/i, '')
          setDiagramName(name)
          setDirty(false)
        } catch (err) {
          alert('Failed to open file: ' + err.message)
        }
      }
      guardUnsaved(doOpen)
    }
    reader.readAsText(file)
    // Reset so the same file can be re-opened
    e.target.value = ''
  }

  const mermaidCode = generateMermaid(nodes, edges, diagramDirection, diagramType, containers)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="app-logo" />
          <h1>Mermaid Diagram Editor{diagramName ? ` — ${diagramName}` : ''}</h1>
        </div>
        <div className="header-controls">
          <button className="btn btn-sm" onClick={() => {
            setSaveName(diagramName)
            setShowSaveDialog(true)
            requestAnimationFrame(() => saveInputRef.current?.focus())
          }}>Save</button>
          <button className="btn btn-sm" onClick={() => setShowOpenDialog(true)}>Open</button>
          <button className="btn btn-sm" onClick={handleExport} disabled={nodes.length === 0}>Export .mde</button>
          <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>Open File</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mde"
            style={{ display: 'none' }}
            onChange={handleFileOpen}
          />
          <span className="header-sep" />
          <label>
            Type:
            <select value={diagramType} onChange={e => setDiagramType(e.target.value)}>
              <option value="flowchart">Flowchart</option>
              <option value="graph">Graph</option>
            </select>
          </label>
          <label>
            Direction:
            <select value={diagramDirection} onChange={e => setDiagramDirection(e.target.value)}>
              <option value="TD">Top-Down</option>
              <option value="LR">Left-Right</option>
              <option value="BT">Bottom-Top</option>
              <option value="RL">Right-Left</option>
            </select>
          </label>
          <button
            className={`preview-toggle ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(p => !p)}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button className="clear-btn" onClick={() => guardUnsaved(clearAll)}>Clear All</button>
        </div>
      </header>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Save Diagram</h3>
            <label>
              Name:
              <input
                ref={saveInputRef}
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveDialog(false) }}
                placeholder="My Diagram"
              />
            </label>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={!saveName.trim()}>Save</button>
              <button className="btn" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning */}
      {showUnsavedWarning && (
        <div className="dialog-overlay warning">
          <div className="dialog">
            <h3>Unsaved Changes</h3>
            <p className="dialog-message">You have unsaved changes. What would you like to do?</p>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={handleUnsavedSave}>Save</button>
              <button className="btn btn-delete" onClick={handleUnsavedDiscard}>Discard</button>
              <button className="btn" onClick={handleUnsavedCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Open Dialog */}
      {showOpenDialog && (
        <div className="dialog-overlay" onClick={() => setShowOpenDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Open Diagram</h3>
            {(() => {
              const saved = getSavedList()
              const names = Object.keys(saved).sort()
              if (names.length === 0) {
                return <p className="muted">No saved diagrams.</p>
              }
              return (
                <ul className="saved-list">
                  {names.map(name => (
                    <li key={name} className="saved-item">
                      <button className="saved-name" onClick={() => handleOpenSaved(name)}>
                        <span>{name}</span>
                        <span className="saved-date">
                          {new Date(saved[name].date).toLocaleDateString()}
                        </span>
                      </button>
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() => handleDeleteSaved(name)}
                        title="Delete"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )
            })()}
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowOpenDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="app-body">
        <Toolbar
          selectedNode={selectedNode ? nodes.find(n => n.id === selectedNode) : null}
          selectedEdge={selectedEdge ? edges.find(e => e.id === selectedEdge) : null}
          selectedContainer={selectedContainer ? containers.find(c => c.id === selectedContainer) : null}
          onUpdateNode={(updates) => updateNode(selectedNode, updates)}
          onDeleteNode={() => deleteNode(selectedNode)}
          onUpdateEdge={(updates) => updateEdge(selectedEdge, updates)}
          onDeleteEdge={() => deleteEdge(selectedEdge)}
          onUpdateContainer={(updates) => updateContainer(selectedContainer, updates)}
          onDeleteContainer={() => deleteContainer(selectedContainer)}
          connectingFrom={connectingFrom}
          onCancelConnect={() => setConnectingFrom(null)}
          creatingContainer={creatingContainer}
          onToggleCreatingContainer={() => setCreatingContainer(prev => !prev)}
        />
        <DiagramCanvas
          nodes={nodes}
          edges={edges}
          containers={containers}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          selectedContainer={selectedContainer}
          connectingFrom={connectingFrom}
          creatingContainer={creatingContainer}
          onSelectNode={selectNode}
          onSelectEdge={selectEdge}
          onSelectContainer={selectContainer}
          onDeselectAll={deselectAll}
          onAddNode={addNode}
          onUpdateNode={updateNode}
          onUpdateEdge={updateEdge}
          onAddContainer={addContainer}
          onUpdateContainer={updateContainer}
          onFinishCreatingContainer={() => setCreatingContainer(false)}
          onStartConnect={setConnectingFrom}
          onCompleteConnect={(toId) => {
            if (connectingFrom) {
              addEdge(connectingFrom, toId)
              setConnectingFrom(null)
            }
          }}
        />
        <MermaidPanel
          code={mermaidCode}
          showPreview={showPreview}
        />
      </div>
    </div>
  )
}
