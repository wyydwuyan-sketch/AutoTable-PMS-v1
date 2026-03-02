/**
 * Imperative text prompt dialog.
 * Renders a lightweight modal with a text input into the DOM.
 * Returns the trimmed input or null if cancelled.
 * No antd dependency.
 */
export const promptForText = (
    title: string,
    initialValue = '',
    placeholder = '请输入内容',
): Promise<string | null> =>
    new Promise<string | null>((resolve) => {
        const container = document.createElement('div')
        document.body.appendChild(container)

        const cleanup = () => container.remove()

        const finish = (result: string | null) => {
            cleanup()
            resolve(result)
        }

        container.innerHTML = `
      <div style="
        position:fixed;inset:0;z-index:2000;
        background:rgba(0,0,0,0.45);
        display:grid;place-items:center;padding:24px;
      " id="__prompt_overlay">
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
            <div style="font-size:15px;font-weight:700;color:var(--text-main);margin-bottom:12px;" id="__prompt_title"></div>
            <input
              id="__prompt_input"
              type="text"
              style="
                width:100%;height:36px;padding:0 12px;
                border:1px solid var(--border-color);border-radius:8px;
                background:var(--bg-panel);color:var(--text-main);
                font-size:14px;outline:none;box-sizing:border-box;
              "
            />
          </div>
          <div style="
            display:flex;justify-content:flex-end;gap:8px;
            padding:12px 20px 16px;
            border-top:1px solid var(--border-color);
          ">
            <button id="__prompt_cancel" style="
              height:32px;padding:0 14px;
              border:1px solid var(--border-color);border-radius:8px;
              background:var(--bg-panel);color:var(--text-main);
              font-size:13px;font-weight:500;cursor:pointer;
            ">取消</button>
            <button id="__prompt_ok" style="
              height:32px;padding:0 14px;
              border:none;border-radius:8px;
              background:var(--primary);color:#fff;
              font-size:13px;font-weight:500;cursor:pointer;
            ">确定</button>
          </div>
        </div>
      </div>
    `

        const titleEl = container.querySelector('#__prompt_title') as HTMLElement
        const inputEl = container.querySelector('#__prompt_input') as HTMLInputElement
        if (titleEl) titleEl.textContent = title
        if (inputEl) {
            inputEl.value = initialValue
            inputEl.placeholder = placeholder
            // Auto-focus and select
            requestAnimationFrame(() => {
                inputEl.focus()
                inputEl.select()
            })
        }

        const submit = () => {
            const val = inputEl?.value?.trim()
            if (!val) return // don't close if empty
            finish(val)
        }

        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') finish(null)
        })
        container.querySelector('#__prompt_ok')?.addEventListener('click', submit)
        container.querySelector('#__prompt_cancel')?.addEventListener('click', () => finish(null))
        container.querySelector('#__prompt_overlay')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) finish(null)
        })
    })
