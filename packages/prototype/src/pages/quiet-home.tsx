import { PersonalHome } from "../../../../src/components/personal-home";
import { mount, WorkbenchFrame } from "../fragment";
mount({
  title: "我的仓库与侧栏片段",
  module: "home",
  source: "Shell / PersonalHome",
  render: () => (
    <WorkbenchFrame module="home">
      <PersonalHome />
    </WorkbenchFrame>
  ),
});
