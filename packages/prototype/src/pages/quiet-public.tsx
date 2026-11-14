import {
  PublicPreviewView,
  PublicPreviewUnavailable,
} from "../../../../src/components/public-preview";
import { preview } from "../mocks/fixtures";
import { mount } from "../fragment";
mount({
  title: "匿名公开画布片段",
  module: "prototypes",
  source: "PublicPreviewView / PublicPreviewUnavailable；资源为包内 mock",
  scenes: ["default", "unavailable"],
  render: (scene) =>
    scene === "unavailable" ? (
      <PublicPreviewUnavailable error="演示版本不存在或已撤回。" />
    ) : (
      <PublicPreviewView meta={preview} />
    ),
});
