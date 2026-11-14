import { AccountLogin } from "../../../../src/components/account-login";
import { AccountSettings } from "../../../../src/components/account-settings";
import { usePersonal } from "../mocks/personal-context";
import { mount, WorkbenchFrame } from "../fragment";
function Credentials() {
  const personal = usePersonal();
  return personal.session?.authenticated ? (
    <WorkbenchFrame module="connections">
      <AccountSettings />
    </WorkbenchFrame>
  ) : (
    <AccountLogin />
  );
}
mount({
  title: "账号与 Token 片段",
  module: "connections",
  source:
    "AccountSettings / AccountLogin；演示账号 demo-lin / demo12345，Token demo",
  scenes: ["default", "login", "empty", "error"],
  render: () => <Credentials />,
});
