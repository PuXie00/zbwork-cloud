import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen bg-slate-900 flex items-center justify-center select-none">
          <div className="text-center space-y-4 px-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-900/40 border border-rose-500/50 flex items-center justify-center">
              <span className="text-rose-400 text-2xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold text-white">页面渲染出错</h2>
            <p className="text-slate-400 text-sm font-mono max-w-md break-all">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-sm font-medium transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

postMessage({ payload: 'removeLoading' }, '*')
