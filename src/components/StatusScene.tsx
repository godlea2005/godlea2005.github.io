import { useEffect, useState } from "react";
import { site } from "../content/site";
import GradientWaves from "./GradientWaves/GradientWaves";
import { ParticleText } from "./ParticleText/ParticleText";
import "./status-scene.css";

const darkParticleColors = ["#f7f5ff", "#ded9f6", "#b8afd9", "#e9aecf"];
const lightParticleColors = ["#201f2a", "#39344f", "#6b5b91", "#9b567d"];

export function StatusScene() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lightTheme, setLightTheme] = useState(
    () => document.documentElement.dataset.theme === "light",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setLightTheme(root.dataset.theme === "light"),
    );
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section className="status-scene" aria-labelledby="home-title">
      <div className="status-scene-background" aria-hidden="true">
        <GradientWaves
          horizonColor="#7656f6"
          waveColor="#ee4be9"
          crestColor="#ffffff"
          speed={reducedMotion ? 0 : 0.55}
          amplitude={2.05}
          waveScale={0.6}
          waveRatio={0.9}
          swell={35}
          turbulence={20}
          tilt={1}
          zoom={1.0}
          height={6}
          fogDepth={18}
          detail="medium"
          brightness={1.0}
          opacity={1.0}
          mouseInteraction={!reducedMotion}
          parallaxStrength={0.5}
          grain={!reducedMotion}
          grainIntensity={0.05}
        />
      </div>
      <div className="status-scene-scrim" aria-hidden="true" />
      <div className="status-scene-inner frame">
        <div className="scene-copy">
          <p className="scene-eyebrow">
            文昊的个人空间 <span>持续探索，认真创造</span>
          </p>
          <h1 id="home-title" aria-label="WENHAO 博客">
            <ParticleText
              text={site.englishName}
              colors={lightTheme ? lightParticleColors : darkParticleColors}
            />
            <span className="scene-blog">
              博客<span aria-hidden="true">.</span>
            </span>
          </h1>
          <p className="scene-role-line">
            AI 设计师 <span>/</span> 电商运营 <span>/</span> 前端开发
          </p>
          <p className="scene-statement">
            把想法做成看得见的作品。
            <br />
            在设计、技术与商业之间，记录我的实践与思考。
          </p>
          <div className="scene-actions">
            <a href="#ai-commerce" className="scene-primary">
              AI 电商设计 <span aria-hidden="true">↗</span>
            </a>
            <a href="#archive" className="scene-secondary">
              浏览作品 <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="scene-lower-edge">
          <a href="#commerce-home-title">
            向下探索 <span aria-hidden="true">↓</span>
          </a>
          <p>
            <i /> 开放交流与合作
          </p>
        </div>
      </div>
    </section>
  );
}
