import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataStorageSettings } from '@/components/settings/DataStorageSettings';

const electronApi = {
  getDataStorageInfo: vi.fn(),
  chooseDataStorageDirectory: vi.fn(),
  inspectDataStorageDirectory: vi.fn(),
  openDataStorageDirectory: vi.fn(),
  applyDataStorageDirectory: vi.fn(),
};

describe('DataStorageSettings', () => {
  beforeEach(() => {
    Object.assign(electronApi, {
      getDataStorageInfo: vi.fn().mockResolvedValue({
        dataRoot: 'C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop',
        isDefault: true,
        hasDatabase: true,
        configurable: true,
      }),
      chooseDataStorageDirectory: vi.fn().mockResolvedValue('D:\\Banana Slides Data'),
      inspectDataStorageDirectory: vi.fn().mockResolvedValue({
        dataRoot: 'D:\\Banana Slides Data',
        exists: true,
        writable: true,
        hasDatabase: true,
        isEmpty: false,
      }),
      openDataStorageDirectory: vi.fn().mockResolvedValue({ success: true }),
      applyDataStorageDirectory: vi.fn().mockResolvedValue({ success: true, restarting: true }),
    });
    (window as typeof window & { electronAPI?: unknown }).electronAPI = electronApi;
  });

  afterEach(() => {
    cleanup();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
    vi.restoreAllMocks();
  });

  it('is hidden when the desktop storage preload API is unavailable', () => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
    const { container } = render(<DataStorageSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reserves the storage section while desktop capabilities are loading', async () => {
    let resolveInfo!: (value: {
      dataRoot: string;
      isDefault: boolean;
      hasDatabase: boolean;
      configurable: boolean;
    }) => void;
    electronApi.getDataStorageInfo.mockReturnValue(new Promise((resolve) => {
      resolveInfo = resolve;
    }));

    render(<DataStorageSettings />);

    const loadingSection = screen.getByRole('status', { name: /Loading data storage location|\u6b63\u5728\u52a0\u8f7d\u6570\u636e\u5b58\u50a8\u4f4d\u7f6e/ });
    expect(loadingSection).toHaveAttribute('aria-busy', 'true');
    expect(loadingSection).toHaveClass('min-h-[220px]');

    resolveInfo({
      dataRoot: 'C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop',
      isDefault: true,
      hasDatabase: true,
      configurable: true,
    });

    expect(await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is hidden when the desktop shell cannot configure an external backend data path', async () => {
    electronApi.getDataStorageInfo.mockResolvedValue({
      dataRoot: '/external/backend/data',
      isDefault: false,
      hasDatabase: true,
      configurable: false,
    });
    const { container } = render(<DataStorageSettings />);

    await waitFor(() => expect(electronApi.getDataStorageInfo).toHaveBeenCalledOnce());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current path and makes manual migration explicit', async () => {
    render(<DataStorageSettings />);

    expect(await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop')).toBeInTheDocument();
    expect(screen.getByText(/does not move or delete existing data automatically|\u4e0d\u4f1a\u81ea\u52a8\u79fb\u52a8\u6216\u5220\u9664\u5df2\u6709\u6570\u636e/)).toBeInTheDocument();
    expect(screen.getByText(/data, uploads, and exports|data、uploads、exports/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ })).toHaveClass('shrink-0', 'whitespace-nowrap', 'text-sm');
    expect(screen.getByRole('button', { name: /Open current folder|\u6253\u5f00\u5f53\u524d\u76ee\u5f55/ })).toHaveClass('whitespace-nowrap', 'text-sm');
    expect(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ })).toHaveClass('whitespace-nowrap', 'text-sm');
  });

  it('browses, validates an existing data directory, and applies it without initialization', async () => {
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    expect(screen.getByDisplayValue('D:\\Banana Slides Data')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    await waitFor(() => {
      expect(electronApi.inspectDataStorageDirectory).toHaveBeenCalledWith('D:\\Banana Slides Data');
      expect(electronApi.applyDataStorageDirectory).toHaveBeenCalledWith('D:\\Banana Slides Data', false);
    });
  });

  it('requires explicit acknowledgement before initializing a location without database.db', async () => {
    electronApi.inspectDataStorageDirectory.mockResolvedValue({
      dataRoot: 'D:\\Empty',
      exists: true,
      writable: true,
      hasDatabase: false,
      isEmpty: true,
    });
    electronApi.chooseDataStorageDirectory.mockResolvedValue('D:\\Empty');
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    const confirmButton = await screen.findByRole('button', { name: /Confirm and restart|\u786e\u8ba4\u5e76\u91cd\u542f/ });
    expect(confirmButton).toBeDisabled();
    expect(electronApi.applyDataStorageDirectory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => {
      expect(electronApi.applyDataStorageDirectory).toHaveBeenCalledWith('D:\\Empty', true);
    });
  });

  it('re-enables editing when applying the selected directory fails', async () => {
    electronApi.applyDataStorageDirectory.mockResolvedValue({ success: false, restarting: false });
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save|\u4fdd\u5b58\u6570\u636e\u5b58\u50a8\u4f4d\u7f6e\u5931\u8d25/);
    expect(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ })).toBeEnabled();
    expect(screen.getByLabelText(/Storage path|\u5b58\u50a8\u8def\u5f84/)).toBeEnabled();
  });

  it('shows a serialized Electron IPC error and allows retrying', async () => {
    electronApi.applyDataStorageDirectory.mockRejectedValue({ message: 'Serialized IPC failure' });
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Serialized IPC failure');
    expect(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ })).toBeEnabled();
  });

  it('shows a string Electron IPC error and allows retrying', async () => {
    electronApi.applyDataStorageDirectory.mockRejectedValue('String IPC failure');
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('String IPC failure');
    expect(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ })).toBeEnabled();
  });

  it('does not restart when inspection normalizes the edited path to the active path', async () => {
    electronApi.chooseDataStorageDirectory.mockResolvedValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop\\.');
    electronApi.inspectDataStorageDirectory.mockResolvedValue({
      dataRoot: 'C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop',
      exists: true,
      writable: true,
      hasDatabase: true,
      isEmpty: false,
    });
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');

    await user.click(screen.getByRole('button', { name: /Browse|\u6d4f\u89c8/ }));
    await user.click(screen.getByRole('button', { name: /Save and restart|\u4fdd\u5b58\u5e76\u91cd\u542f/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in use|\u5df2\u4f7f\u7528\u6b64\u6570\u636e\u5b58\u50a8\u4f4d\u7f6e/);
    expect(electronApi.applyDataStorageDirectory).not.toHaveBeenCalled();
  });

  it('opens the active directory rather than an uncommitted edited path', async () => {
    const user = userEvent.setup();
    render(<DataStorageSettings />);
    const input = await screen.findByDisplayValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');
    await user.clear(input);
    await user.type(input, 'D:\\Uncommitted');

    await user.click(screen.getByRole('button', { name: /Open current folder|\u6253\u5f00\u5f53\u524d\u76ee\u5f55/ }));
    expect(electronApi.openDataStorageDirectory).toHaveBeenCalledOnce();
    expect(electronApi.inspectDataStorageDirectory).not.toHaveBeenCalled();
  });
});
