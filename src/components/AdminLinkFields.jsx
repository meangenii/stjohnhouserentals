import { buildLinkRecord, LINK_TYPE_OPTIONS, mergeRouteOptions, resolveLinkEditorState } from '../lib/linkRecords'

export function AdminLinkFields({
  defaultType = 'external',
  destinationField = 'href',
  destinationLabel = 'Link',
  disabled = false,
  link,
  onChange,
  routeOptions = [],
  routeSuggestions = [],
}) {
  const linkState = resolveLinkEditorState(link, { defaultType, destinationField })
  const selectableRouteOptions = mergeRouteOptions(routeOptions, routeSuggestions, linkState.internalPath)

  function updateLink(nextPartialState) {
    onChange(
      buildLinkRecord(
        link,
        {
          ...linkState,
          ...nextPartialState,
        },
        { destinationField },
      ),
    )
  }

  return (
    <div className="admin-link-editor-fields">
      <label className="admin-field">
        <span>{destinationLabel} Type</span>
        <select disabled={disabled} value={linkState.type} onChange={(event) => updateLink({ type: event.target.value })}>
          {LINK_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {linkState.type === 'internal' ? (
        <>
          {selectableRouteOptions.length > 0 ? (
            <label className="admin-field admin-field--wide">
              <span>{destinationLabel} Route</span>
              <select disabled={disabled} value={linkState.internalPath} onChange={(event) => updateLink({ internalPath: event.target.value })}>
                {!linkState.internalPath ? <option value="">Select a route</option> : null}
                {selectableRouteOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="admin-field admin-field--wide">
            <span>{destinationLabel} Path</span>
            <input
              disabled={disabled}
              placeholder="/example-route"
              type="text"
              value={linkState.internalPath}
              onChange={(event) => updateLink({ internalPath: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {linkState.type === 'external' ? (
        <>
          <label className="admin-field admin-field--wide">
            <span>{destinationLabel} URL</span>
            <input
              disabled={disabled}
              placeholder="https://example.com"
              type="url"
              value={linkState.externalUrl}
              onChange={(event) => updateLink({ externalUrl: event.target.value })}
            />
          </label>

          <label className="admin-checkbox-field admin-field--wide">
            <input
              checked={linkState.openInNewTab}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => updateLink({ openInNewTab: event.target.checked })}
            />
            <span>Open external page in a new tab</span>
          </label>
        </>
      ) : null}

      {linkState.type === 'email' ? (
        <>
          <label className="admin-field">
            <span>{destinationLabel} Email</span>
            <input
              disabled={disabled}
              placeholder="name@example.com"
              type="email"
              value={linkState.emailAddress}
              onChange={(event) => updateLink({ emailAddress: event.target.value })}
            />
          </label>

          <label className="admin-checkbox-field">
            <input
              checked={linkState.emailCcEnabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => updateLink({ emailCcEnabled: event.target.checked })}
            />
            <span>Use CC</span>
          </label>
          <label className="admin-field">
            <span>{destinationLabel} CC</span>
            <input
              disabled={disabled || !linkState.emailCcEnabled}
              placeholder="cc@example.com"
              type="email"
              value={linkState.emailCc}
              onChange={(event) => updateLink({ emailCc: event.target.value })}
            />
          </label>

          <label className="admin-checkbox-field">
            <input
              checked={linkState.emailBccEnabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => updateLink({ emailBccEnabled: event.target.checked })}
            />
            <span>Use BCC</span>
          </label>
          <label className="admin-field">
            <span>{destinationLabel} BCC</span>
            <input
              disabled={disabled || !linkState.emailBccEnabled}
              placeholder="bcc@example.com"
              type="email"
              value={linkState.emailBcc}
              onChange={(event) => updateLink({ emailBcc: event.target.value })}
            />
          </label>

          <label className="admin-field admin-field--wide">
            <span>{destinationLabel} Subject</span>
            <input
              disabled={disabled}
              placeholder="Email subject"
              type="text"
              value={linkState.emailSubject}
              onChange={(event) => updateLink({ emailSubject: event.target.value })}
            />
          </label>

          <label className="admin-field admin-field--wide">
            <span>{destinationLabel} Body</span>
            <textarea
              disabled={disabled}
              placeholder="Email body"
              rows={5}
              value={linkState.emailBody}
              onChange={(event) => updateLink({ emailBody: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {linkState.type === 'phone' ? (
        <label className="admin-field admin-field--wide">
          <span>{destinationLabel} Phone</span>
          <input
            disabled={disabled}
            placeholder="+1 340 555 1212"
            type="tel"
            value={linkState.phoneNumber}
            onChange={(event) => updateLink({ phoneNumber: event.target.value })}
          />
        </label>
      ) : null}
    </div>
  )
}
