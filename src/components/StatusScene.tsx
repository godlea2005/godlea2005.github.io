import { site } from "../content/site";
import type { Theme } from "../lib/theme";
import { useMotionProfile } from "../lib/useMotionProfile";
import GradientWaves from "./GradientWaves/GradientWaves";
import { ParticleText } from "./ParticleText/ParticleText";
import { TextType } from "./TextType";
import "./status-scene.css";

const darkParticleColors = ["#f7f5ff", "#ded9f6", "#b8afd9", "#e9aecf"];
const lightParticleColors = ["#201f2a", "#39344f", "#6b5b91", "#9b567d"];
const heroStatements = [
  '记录设计与技术的现场',
  '把想法做成看得见的作品',
  '在商业与创作之间持续实践',
] as const;

export function StatusScene({ theme }: { theme: Theme }) {
  const { reducedMotion, fineHover } = useMotionProfile();

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
          mouseInteraction={fineHover && !reducedMotion}
          parallaxStrength={0.5}
          grain={!reducedMotion}
          grainIntensity={0.05}
        />
      </div>
      <div className="status-scene-scrim" aria-hidden="true" />
      <div className="status-scene-inner frame">
        <div className="scene-copy">
          <h1 id="home-title" aria-label="WENHAO">
            <ParticleText
              text={site.englishName}
              colors={theme === "light" ? lightParticleColors : darkParticleColors}
              interaction={fineHover ? 'repel-and-burst' : 'tap-burst'}
            />
          </h1>
          <p className="scene-role-line">
            AI 工程师
          </p>
          <p className="scene-statement"><TextType texts={heroStatements} loop /></p>
        </div>
        <div className="scene-lower-edge">
          <a href="#home-guide">
            向下探索 <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
