// src/components/common/GlobalErrorBoundary.tsx
import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: undefined,
  };

  static getDerivedStateFromError(error: unknown): State {
    let message = "알 수 없는 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // 개발자 콘솔에서 상세 로그 확인용
    console.error("[GlobalErrorBoundary] Caught error:", error, errorInfo);
    
    // 동적 import 오류인 경우 자동으로 홈으로 리다이렉트
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('Failed to fetch dynamically imported module')) {
      // 2초 후 자동으로 홈으로 이동
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleTryAgain = () => {
    // 에러 상태만 초기화해서, 사용자가 한 번 더 시도해볼 수 있게 함
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        typeof this.state.message === "string" &&
        this.state.message.includes(
          "Failed to fetch dynamically imported module"
        );

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f5f5",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              backgroundColor: "#ffffff",
              borderRadius: "20px",
              boxShadow:
                "0 18px 45px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(148, 163, 184, 0.15)",
              padding: "24px 22px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>😅</div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              {isChunkError
                ? "사이트가 새 버전으로 업데이트 되었어요"
                : "일시적인 오류가 발생했어요"}
            </h1>

            <p
              style={{
                fontSize: "13px",
                color: "#6b7280",
                lineHeight: 1.6,
                marginBottom: "18px",
              }}
            >
              {isChunkError
                ? "잠시 전에 사이트가 새로 배포되어, 예전 화면이 남아 있을 수 있어요. 아래 버튼을 눌러 새로고침하면 최신 SongdoPick 화면으로 다시 접속됩니다."
                : "잠깐 네트워크가 불안정하거나, 일시적인 문제일 수 있어요. 아래 버튼을 눌러 다시 시도해 주세요."}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "8px 16px",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                새로고침하기
              </button>

              <button
                type="button"
                onClick={this.handleTryAgain}
                style={{
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  color: "#6b7280",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                그냥 다시 시도
              </button>
            </div>

            <p
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                lineHeight: 1.5,
              }}
            >
              계속 같은 화면이 나오면
              <br />
              브라우저 탭을 닫았다가 다시 열어 주세요.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;