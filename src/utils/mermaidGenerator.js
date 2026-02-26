function shapeWrap(label, shape) {
  const safe = label.replace(/"/g, '#quot;')
  switch (shape) {
    case 'round':
      return `(${safe})`
    case 'stadium':
      return `([${safe}])`
    case 'diamond':
      return `{${safe}}`
    case 'hexagon':
      return `{{${safe}}}`
    case 'circle':
      return `((${safe}))`
    case 'asymmetric':
      return `>${safe}]`
    case 'parallelogram':
      return `[/${safe}/]`
    case 'cylinder':
      return `[(${safe})]`
    case 'subroutine':
      return `[[${safe}]]`
    case 'rect':
    default:
      return `[${safe}]`
  }
}

export function generateMermaid(nodes, edges, direction = 'TD', type = 'flowchart') {
  if (nodes.length === 0) return ''

  const lines = [`${type} ${direction}`]

  for (const node of nodes) {
    lines.push(`    ${node.id}${shapeWrap(node.label, node.shape)}`)
  }

  for (const edge of edges) {
    if (edge.label) {
      lines.push(`    ${edge.from} -->|${edge.label}| ${edge.to}`)
    } else {
      lines.push(`    ${edge.from} --> ${edge.to}`)
    }
  }

  return lines.join('\n')
}
