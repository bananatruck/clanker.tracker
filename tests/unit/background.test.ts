import { afterEach, describe, expect, it, vi } from 'vitest';

describe('background side-panel registration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('leaves toolbar opening to Chrome and opens the page launcher synchronously', async () => {
    const runtimeListeners: Array<(
      request: { type?: string },
      sender: { tab?: { id?: number } },
      sendResponse: (reply: unknown) => void,
    ) => boolean> = [];
    const setPanelBehavior = vi.fn(() => Promise.resolve());
    const open = vi.fn(() => Promise.resolve());
    const onActionClicked = vi.fn();

    vi.stubGlobal('defineBackground', (main: () => void) => main);
    vi.stubGlobal('chrome', {
      sidePanel: { setPanelBehavior, open },
      action: { onClicked: { addListener: onActionClicked } },
      tabs: { create: vi.fn(() => Promise.resolve()), },
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: (listener: (typeof runtimeListeners)[number]) => {
            runtimeListeners.push(listener);
          },
        },
      },
    });

    const { default: start } = await import('@/entrypoints/background');
    (start as unknown as () => void)();

    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    expect(onActionClicked).not.toHaveBeenCalled();

    for (const listener of runtimeListeners) {
      listener({ type: 'clanker:open-panel' }, { tab: { id: 42 } }, vi.fn());
    }

    // The spy is already populated before the listener returns. An IndexedDB
    // lookup or other await here would consume Chrome's user-activation token.
    expect(open).toHaveBeenCalledWith({ tabId: 42 });
  });
});
