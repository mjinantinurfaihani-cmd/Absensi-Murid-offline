import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SqlConsole from './SqlConsoleIndex';

test('renders SqlConsole and blocks destructive queries in read-only mode', async () => {
  const mockToast = jest.fn();
  render(<SqlConsole showToast={mockToast as any} />);

  expect(screen.getByText(/SQL Console/i)).toBeInTheDocument();

  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  const runButton = screen.getByText(/Jalankan/i);

  // try a destructive query while read-only
  fireEvent.change(textarea, { target: { value: 'DELETE FROM students WHERE 1=1' } });
  fireEvent.click(runButton);

  // result should contain blocked message
  const blocked = await screen.findByText(/Query diblokir/i);
  expect(blocked).toBeInTheDocument();
});
