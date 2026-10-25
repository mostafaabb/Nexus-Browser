// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Badge, EmptyState, ErrorNote, Spinner } from '@renderer/components/ui/Feedback'
import { Button, IconButton } from '@renderer/components/ui/Button'
import { Input, Label, Select } from '@renderer/components/ui/Input'
import { Toggle } from '@renderer/components/ui/Toggle'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })

  it('calls the click handler', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call the handler while it is disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('exposes an accessible name', () => {
    render(<IconButton label="Close tab" />)
    const button = screen.getByRole('button', { name: 'Close tab' })
    expect(button.getAttribute('aria-label')).toBe('Close tab')
    expect(button.getAttribute('title')).toBe('Close tab')
  })

  it('reports its pressed state', () => {
    render(<IconButton label="Mute" active />)
    expect(screen.getByRole('button', { name: 'Mute' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Toggle', () => {
  it('reflects the checked state', () => {
    render(<Toggle checked={false} onChange={() => undefined} label="Record history" />)
    expect(
      screen.getByRole('switch', { name: 'Record history' }).getAttribute('aria-checked')
    ).toBe('false')
  })

  it('reports the new value', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Record history" />)
    await userEvent.click(screen.getByRole('switch', { name: 'Record history' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not fire while it is disabled', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Record history" disabled />)
    await userEvent.click(screen.getByRole('switch', { name: 'Record history' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Input', () => {
  it('forwards the value and the change handler', async () => {
    const onChange = vi.fn()
    render(<Input aria-label="Search" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Search'), 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('marks itself as invalid', () => {
    const { container } = render(<Input aria-label="Search" invalid />)
    expect(container.querySelector('input')?.className).toContain('border-danger')
  })
})

describe('Label', () => {
  it('links the label to its control', () => {
    render(
      <>
        <Label htmlFor="engine">Search engine</Label>
        <Input id="engine" />
      </>
    )
    expect(screen.getByLabelText('Search engine')).toBeTruthy()
  })
})

describe('Select', () => {
  it('renders its options', () => {
    render(
      <Select aria-label="Theme" defaultValue="dark">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </Select>
    )
    expect(screen.getByLabelText('Theme')).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })
})

describe('feedback components', () => {
  it('renders a badge', () => {
    render(<Badge tone="success">Saved</Badge>)
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('renders a spinner with a status role', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('renders an empty state with an action', async () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        title="No bookmarks yet"
        description="Bookmark a page to see it here."
        action={<Button onClick={onClick}>Add bookmark</Button>}
      />
    )
    expect(screen.getByText('No bookmarks yet')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add bookmark' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders an error note', () => {
    render(<ErrorNote>Could not save.</ErrorNote>)
    expect(screen.getByText('Could not save.')).toBeTruthy()
  })
})
