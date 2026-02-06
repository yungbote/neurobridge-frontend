import React from "react";
import { recordRouteError } from "@/shared/observability/rum";

type Props = {
  path: string;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    recordRouteError(this.props.path, error);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.path !== this.props.path && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p>Please refresh the page or try again later.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
