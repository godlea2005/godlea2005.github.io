import { profile, site } from '../content/site'

export function AboutSection() {
  return <section className="about-section" id="about" aria-labelledby="about-title">
    <div className="about-inner frame">
      <div className="about-intro">
        <p className="home-section-eyebrow">FIELD NOTES / 06 — ABOUT</p>
        <h2 id="about-title">关于文昊<span aria-hidden="true">.</span></h2>
        <p>从不同的工作视角，持续练习把想法变成具体、可用的东西。</p>
      </div>
      <div className="about-details">
        <p className="about-label">三个工作视角</p>
        <ul>{profile.roles.map((role) => <li key={role}>{role}</li>)}</ul>
        <p className="about-label">{profile.statusTitle}</p>
        <p className="about-status">{profile.status}</p>
        <div className="about-links">
          <a href="#guestbook">去留言 <span aria-hidden="true">↗</span></a>
          <a href={`mailto:${site.contacts.email}`}>{site.contacts.email}</a>
        </div>
      </div>
    </div>
  </section>
}
