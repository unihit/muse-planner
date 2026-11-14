// 로컬 개발/개인 브라우저 환경에서 API 주소와 토큰을 분리 관리할 때 사용합니다.
// 이 파일을 js/config.local.js 로 복사한 뒤 실제 값을 입력하세요. (js/config.local.js 는 .gitignore 됨)
window.MUSE_PLANNER_LOCAL_CONFIG = {
  mode: "agent",
  agentApiUrl: "https://<your-project-ref>.supabase.co/functions/v1/agent-api",
  agentApiToken: ""
};
