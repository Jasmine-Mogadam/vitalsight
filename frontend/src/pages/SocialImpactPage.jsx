export default function SocialImpactPage() {
  return (
    <div className="page-shell">
      <article className="panel detail-page">
        <h1>Social Impact</h1>
        <p className="subtitle">
          Democratizing clinical trial access for underserved communities
        </p>

        <div className="stat-grid">
          <div className="stat-card">
            <a
              href="https://link.springer.com/article/10.1186/s12913-025-13698-2"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">~70%</div>
              <div className="stat-label">
                Of adults are willing to join a clinical trial - yet only 2-3%
                of adult cancer patients enroll <sup>[1]</sup>
              </div>
            </a>
          </div>
          <div className="stat-card">
            <a
              href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3863700/"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">$40B</div>
              <div className="stat-label">
                Annual economic burden of health disparities in the US{" "}
                <sup>[2]</sup>
              </div>
            </a>
          </div>
          <div className="stat-card">
            <a
              href="https://www.fda.gov/media/145718/download"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">75%+</div>
              <div className="stat-label">
                Of clinical trial participants are white <sup>[3]</sup>
              </div>
            </a>
          </div>
        </div>

        <h2>The Challenge</h2>
        <p>
          Clinical trials are critical for developing life-saving treatments,
          yet participation remains deeply inequitable. Most adults say they
          would participate in a trial if asked - but geographic distance, lack
          of transportation, work obligations, and caregiving responsibilities
          disproportionately exclude rural communities, low-income families,
          elderly populations, and communities of color. The result: trial
          populations that do not reflect the people these treatments are meant
          to serve.
        </p>

        <h2>How VitalSight Helps</h2>
        <ul>
          <li>
            <strong>Zero Hardware Barrier:</strong> Any smartphone or laptop
            with a camera works - no expensive wearables or trips to a clinic
          </li>
          <li>
            <strong>Voice-Guided Accessibility:</strong> ElevenLabs-powered
            voice coaching guides patients through check-ins in natural
            language, supporting elderly and low-literacy users
          </li>
          <li>
            <strong>Remote Participation:</strong> Patients in rural areas can
            participate in trials from home, eliminating travel barriers
          </li>
          <li>
            <strong>Diverse Representation:</strong> By removing geographic and
            economic barriers, VitalSight can help clinical trials better
            represent the populations they serve
          </li>
          <li>
            <strong>Caregiver Flexibility:</strong> Check-ins take 2 minutes
            from home vs. half-day clinic visits, enabling participation for
            working parents and caregivers
          </li>
        </ul>

        <h2>Real-World Impact</h2>
        <p>
          When clinical trials include diverse populations, the resulting
          treatments are safer and more effective for everyone. VitalSight aims
          to increase trial enrollment from underserved communities by 3x within
          its first year of deployment, contributing to more equitable
          healthcare outcomes worldwide.
        </p>

        <div className="bibliography">
          <h2>Sources</h2>
          <ol>
            <li id="ref-1">
              <a
                href="https://link.springer.com/article/10.1186/s12913-025-13698-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                National Cancer Institute. &quot;Differences in rural and urban
                patient perceptions of facilitative factors for cancer clinical
                trial participation.&quot; NCI, National Institutes of Health.
              </a>
            </li>
            <li id="ref-2">
              <a
                href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3863700/"
                target="_blank"
                rel="noopener noreferrer"
              >
                LaVeist TA, et al. &quot;Increasing Racial/Ethnic Diversity in
                Nursing to Reduce Health Disparities and Achieve Health
                Equity.&quot; NIH PMC, 2013.
              </a>
            </li>
            <li id="ref-3">
              <a
                href="https://www.fda.gov/media/145718/download"
                target="_blank"
                rel="noopener noreferrer"
              >
                2020 U.S. Food and Drug Administration. &quot;Drug Trials
                Snapshots Summary Report.&quot; FDA, 2020.
              </a>
            </li>
          </ol>
        </div>
      </article>
    </div>
  );
}
