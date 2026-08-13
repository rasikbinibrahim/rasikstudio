import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { AgentQuestionPrompt } from './AgentQuestionPrompt'

describe('AgentQuestionPrompt', () => {
  beforeEach(() => {
    useAppStore.setState({ agentPendingQuestion: {} })
  })

  it('renders nothing when there is no pending question for this task', () => {
    const { container } = render(<AgentQuestionPrompt taskId="t1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending question', () => {
    useAppStore.setState({
      agentPendingQuestion: { t1: { question: 'Which file should I edit?' } },
    })
    render(<AgentQuestionPrompt taskId="t1" />)

    expect(screen.getByText('Which file should I edit?')).toBeInTheDocument()
  })

  it('the Send button is disabled until an answer is typed', async () => {
    useAppStore.setState({ agentPendingQuestion: { t1: { question: 'Which file?' } } })
    render(<AgentQuestionPrompt taskId="t1" />)

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Your answer'), 'src/utils.ts')

    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('submits the trimmed answer on clicking Send', async () => {
    const answerAgentQuestion = vi.fn()
    useAppStore.setState({
      agentPendingQuestion: { t1: { question: 'Which file?' } },
      answerAgentQuestion,
    })
    render(<AgentQuestionPrompt taskId="t1" />)

    await userEvent.type(screen.getByPlaceholderText('Your answer'), '  src/utils.ts  ')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(answerAgentQuestion).toHaveBeenCalledWith('t1', 'src/utils.ts')
  })

  it('submits on pressing Enter', async () => {
    const answerAgentQuestion = vi.fn()
    useAppStore.setState({
      agentPendingQuestion: { t1: { question: 'Which file?' } },
      answerAgentQuestion,
    })
    render(<AgentQuestionPrompt taskId="t1" />)

    await userEvent.type(screen.getByPlaceholderText('Your answer'), 'src/utils.ts{Enter}')

    expect(answerAgentQuestion).toHaveBeenCalledWith('t1', 'src/utils.ts')
  })

  it('does not submit an empty or whitespace-only answer', async () => {
    const answerAgentQuestion = vi.fn()
    useAppStore.setState({
      agentPendingQuestion: { t1: { question: 'Which file?' } },
      answerAgentQuestion,
    })
    render(<AgentQuestionPrompt taskId="t1" />)

    await userEvent.type(screen.getByPlaceholderText('Your answer'), '   {Enter}')

    expect(answerAgentQuestion).not.toHaveBeenCalled()
  })

  it('only shows the question for the matching task id', () => {
    useAppStore.setState({ agentPendingQuestion: { other: { question: 'x' } } })
    const { container } = render(<AgentQuestionPrompt taskId="t1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
