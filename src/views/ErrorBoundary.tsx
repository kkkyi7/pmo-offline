import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: string
}

interface State {
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="panel" style={{ padding: 20 }}>
          <p>{this.props.fallback ?? '这一页出错了。'}</p>
          <pre className="doc">{this.state.message}</pre>
          <button type="button" onClick={() => this.setState({ message: '' })}>
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
