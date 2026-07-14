import { Component, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hata: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hata: null };

  static getDerivedStateFromError(error: Error): State {
    return { hata: error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("UI hatasi:", error, info);
  }

  render() {
    if (!this.state.hata) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-cream">
        <div className="card shadow-e2 p-6 max-w-md">
          <div className="text-bad-ink font-semibold text-xl">Bir hata oluştu</div>
          <div className="text-sm text-ink/70 mt-2 font-mono break-all">
            {this.state.hata.message}
          </div>
          <button onClick={() => location.reload()}
            className="btn btn-primary mt-4">
            Sayfayı yenile
          </button>
        </div>
      </div>
    );
  }
}
