export function EditorIconButton({ className = '', icon: Icon, label, tone = 'default', ...buttonProps }) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={`editor-icon-button${tone === 'danger' ? ' editor-icon-button--danger' : ''}${className ? ` ${className}` : ''}`}
      title={label}
      type={buttonProps.type ?? 'button'}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={2} />
    </button>
  )
}
