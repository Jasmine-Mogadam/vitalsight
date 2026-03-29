export default function BusinessPlanPage() {
  return (
    <div className="page-shell">
      <article className="panel detail-page">
        <h1>Business Plan</h1>
        <p className="subtitle">
          VitalSight - Contactless Remote Patient Monitoring for Clinical Trials
        </p>

        <div className="stat-grid">
          <div className="stat-card">
            <a
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">$4B-$6B</div>
              <div className="stat-label">
                Wasted annually on clinical trial inefficiencies <sup>[1]</sup>
              </div>
            </a>
          </div>
          <div className="stat-card">
            <a
              href="https://www.appliedclinicaltrialsonline.com/view/enrollment-performance-weighing-facts"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">80%</div>
              <div className="stat-label">
                Of clinical trials fail to meet enrollment timelines{" "}
                <sup>[2]</sup>
              </div>
            </a>
          </div>
          <div className="stat-card">
            <a
              href="https://acrpnet.org/2023/02/22/unique-considerations-for-patient-retention-in-decentralized-clinical-trials"
              target="_blank"
              rel="noopener noreferrer"
              className="stat-link"
            >
              <div className="stat-value">30%</div>
              <div className="stat-label">
                Average patient dropout rate in clinical trials <sup>[3]</sup>
              </div>
            </a>
          </div>
        </div>

        <h2>The Problem</h2>
        <p>
          It takes an average of{" "}
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
            target="_blank"
            rel="noopener noreferrer"
            className="cite-link"
            title="Source [1]"
          >
            14 years<sup>[1]</sup>
          </a>{" "}
          and over{" "}
          <a
            href="https://www.appliedclinicaltrialsonline.com/view/tufts-csdd-cost-develop-new-drug-26b"
            target="_blank"
            rel="noopener noreferrer"
            className="cite-link"
            title="Source [4]"
          >
            $2.6B<sup>[4]</sup>
          </a>{" "}
          to bring a single drug to market - driven largely by clinical trial
          complexity and failures. Frequent in-person vital sign checks create
          barriers for participants in rural and underserved communities,
          leading to high dropout rates and delayed approvals. A significant
          portion of these costs are self-inflicted - companies reinvent the
          wheel every time they conduct a trial, from setting up site networks
          to developing and implementing protocols. Shared clinical trial
          networks could eliminate much of this waste, but they remain few and
          far between (
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
            target="_blank"
            rel="noopener noreferrer"
            className="cite-link"
            title="Source [1]"
          >
            NIH<sup>[1]</sup>
          </a>
          ). Patients who could benefit from cutting-edge treatments are
          excluded simply because they live too far from a trial site.
        </p>

        <h2>Our Solution</h2>
        <p>
          VitalSight turns any device with a camera into a clinical-grade vitals
          monitoring station. Using advanced computer vision (rPPG technology
          via Presage), patients can complete vital sign check-ins from home -
          no wearable devices required. AI-powered analysis flags anomalies in
          real-time, while blockchain logging ensures data integrity for
          regulatory compliance.
        </p>

        <h2>Revenue Model</h2>
        <ul>
          <li>
            <strong>Per-Patient-Per-Month (PPPM):</strong> $50-200/patient/month
            SaaS subscription for Clinical Research Organizations (CROs)
          </li>
          <li>
            <strong>Platform License:</strong> Annual license for pharma
            companies running multiple trials
          </li>
          <li>
            <strong>Data Insights:</strong> Anonymized, aggregated health trend
            analytics for research
          </li>
        </ul>

        <h2>Competitive Advantage</h2>
        <ul>
          <li>
            <strong>No Hardware Required:</strong> Unlike competitors
            (BioIntelliSense, Current Health), we need only a webcam
          </li>
          <li>
            <strong>Immutable Audit Trail:</strong> Solana blockchain logging
            provides tamper-proof compliance data
          </li>
          <li>
            <strong>AI-Powered Insights:</strong> Real-time anomaly detection
            reduces missed adverse events
          </li>
          <li>
            <strong>Voice-Guided UX:</strong> ElevenLabs-powered voice coaching
            makes the platform accessible to elderly and low-literacy
            participants
          </li>
        </ul>

        <h2>Go-to-Market</h2>
        <ul>
          <li>
            <strong>Phase 1:</strong> Partner with 2-3 mid-size CROs for pilot
            studies
          </li>
          <li>
            <strong>Phase 2:</strong> Seek FDA 510(k) clearance for
            clinical-grade classification
          </li>
          <li>
            <strong>Phase 3:</strong> Expand to telehealth and chronic disease
            monitoring
          </li>
        </ul>

        <h2>Team &amp; Ask</h2>
        <p>
          Seeking $500K seed funding for FDA regulatory pathway, clinical
          validation studies, and engineering team expansion. Target: 10 CRO
          partnerships within 18 months.
        </p>

        <div className="bibliography">
          <h2>Sources</h2>
          <ol>
            <li id="ref-1">
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4189694/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stephen Barlas. &quot;The Clinical Trial Model Is Up for
                Review.&quot; Clinical Trials, National Institutes of Health,
                2016.
              </a>
            </li>
            <li id="ref-2">
              <a
                href="https://www.appliedclinicaltrialsonline.com/view/enrollment-performance-weighing-facts"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ken Getz. &quot;Enrollment Performance: Weighing the
                Facts.&quot; Applied Clinical Trials Online.
              </a>
            </li>
            <li id="ref-3">
              <a
                href="https://acrpnet.org/2023/02/22/unique-considerations-for-patient-retention-in-decentralized-clinical-trials"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ingrid Oakley-Girvan. &quot;Unique Considerations for Patient
                Retention in Decentralized Clinical Trials.&quot; Association of
                Clinical Research Professionals, 2023.
              </a>
            </li>
            <li id="ref-4">
              <a
                href="https://www.appliedclinicaltrialsonline.com/view/tufts-csdd-cost-develop-new-drug-26b"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tufts Center for the Study of Drug Development. &quot;Cost to
                Develop a New Drug is $2.6 Billion.&quot; Applied Clinical
                Trials Online.
              </a>
            </li>
          </ol>
        </div>
      </article>
    </div>
  );
}
