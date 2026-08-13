import { normalizeBlockPreviewDevice } from './blockResponsive.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

export function updateValueAtPath(root, path, nextValue) {
  if (!path.length) {
    return nextValue
  }

  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const nextSegment = path[index + 1]

    if (target[segment] == null) {
      target[segment] = typeof nextSegment === 'number' ? [] : {}
    }

    target = target[segment]
  }

  const lastSegment = path[path.length - 1]
  target[lastSegment] = typeof nextValue === 'function' ? nextValue(target[lastSegment]) : nextValue
  return nextRoot
}

export function createInlinePageEditorValue({
  activeFieldId,
  device = 'desktop',
  disabled = false,
  onChange,
  renderSelectionInspector,
  selectedBlockId = '',
  setActiveFieldId,
  setSelectedBlockId,
}) {
  return {
    activeFieldId,
    device: normalizeBlockPreviewDevice(device),
    disabled,
    renderSelectionInspector,
    selectedBlockId,
    setActiveFieldId,
    setSelectedBlockId,
    updatePath(path, nextValue) {
      onChange((currentValue) => updateValueAtPath(currentValue, path, nextValue), {
        coalesce: typeof nextValue === 'string' || typeof nextValue === 'number',
        path,
      })
    },
  }
}
