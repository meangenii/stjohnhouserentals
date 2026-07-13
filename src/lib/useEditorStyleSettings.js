import { useEffect, useState } from 'react'
import { readEditorStyleSettings, subscribeEditorStyleSettings } from './editorStyleSettings'

export function useEditorStyleSettings() {
  const [settings, setSettings] = useState(() => readEditorStyleSettings())

  useEffect(() => subscribeEditorStyleSettings(setSettings), [])

  return settings
}
