import type { ReactNode } from 'react'

type ConfirmActionOptions = {
  title: ReactNode
  content?: ReactNode
  okText?: string
  cancelText?: string
  danger?: boolean
}

/**
 * Imperative confirm dialog.
 * Renders a lightweight modal into the DOM and returns a Promise<boolean>.
 * No antd dependency.
 */
export const confirmAction = ({
  title,
  content,
  okText = '确认',
  cancelText = '取消',
  danger = false,
}: ConfirmActionOptions) =>
  new Promise<boolean>((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const cleanup = () => {
      container.remove()
    }

    const finish = (result: boolean) => {
      cleanup()
      resolve(result)
    }

    // Use CSS custom properties from the design system
    container.innerHTML = `
      <div style="
        position:fixed;inset:0;z-index:2000;
        background:rgba(0,0,0,0.45);
        display:grid;place-items:center;padding:24px;
      " id="__confirm_overlay">
        <div style="
          width:100%;max-width:400px;
          border-radius:12px;
          border:1px solid var(--border-color);
          background:var(--bg-panel);
          box-shadow:0 20px 60px rgba(0,0,0,0.18);
          animation:modal-in 0.2s ease;
          overflow:hidden;
        ">
          <div style="padding:20px 20px 12px;">
            <div style="font-size:15px;font-weight:700;color:var(--text-main);margin-bottom:6px;" id="__confirm_title"></div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;display:none;" id="__confirm_content"></div>
          </div>
          <div style="
            display:flex;justify-content:flex-end;gap:8px;
            padding:12px 20px 16px;
            border-top:1px solid var(--border-color);
          ">
            <button id="__confirm_cancel" style="
              height:32px;padding:0 14px;
              border:1px solid var(--border-color);border-radius:8px;
              background:var(--bg-panel);color:var(--text-main);
              font-size:13px;font-weight:500;cursor:pointer;
            ">${cancelText}</button>
            <button id="__confirm_ok" style="
              height:32px;padding:0 14px;
              border:none;border-radius:8px;
              background:${danger ? '#ef4444' : 'var(--primary)'};
              color:#fff;font-size:13px;font-weight:500;cursor:pointer;
            ">${okText}</button>
          </div>
        </div>
      </div>
    `

    // Set text content (safe from XSS)
    const titleEl = container.querySelector('#__confirm_title') as HTMLElement
    const contentEl = container.querySelector('#__confirm_content') as HTMLElement
    if (titleEl) titleEl.textContent = typeof title === 'string' ? title : ''
    if (content && contentEl) {
      contentEl.style.display = 'block'
      contentEl.textContent = typeof content === 'string' ? content : ''
    }

    container.querySelector('#__confirm_ok')?.addEventListener('click', () => finish(true))
    container.querySelector('#__confirm_cancel')?.addEventListener('click', () => finish(false))
    container.querySelector('#__confirm_overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) finish(false)
    })

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEsc)
        finish(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
  })
