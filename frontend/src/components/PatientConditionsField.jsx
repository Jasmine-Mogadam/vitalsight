import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MEDICAL_HISTORY_GROUPS } from './patientProfileOptions';

export default function PatientConditionsField({ value, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);
  const animationFrameRef = useRef(0);
  const activeGroup = MEDICAL_HISTORY_GROUPS[activeGroupIndex];

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    setContentHeight(contentRef.current.scrollHeight);
  }, [activeGroupIndex, selected]);

  useEffect(() => () => window.cancelAnimationFrame(animationFrameRef.current), []);

  const toggle = (option) => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };

  const goToGroup = (nextIndex) => {
    if (nextIndex === activeGroupIndex || nextIndex < 0 || nextIndex >= MEDICAL_HISTORY_GROUPS.length) return;

    if (contentRef.current) {
      setContentHeight(contentRef.current.getBoundingClientRect().height);
    }

    setActiveGroupIndex(nextIndex);
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = window.requestAnimationFrame(() => {
      if (!contentRef.current) return;
      setContentHeight(contentRef.current.scrollHeight);
    });
  };

  return (
    <div className="conditions-field">
      <div className="conditions-header">
        <span>Preexisting conditions and history</span>
      </div>
      <div className="conditions-layout">
        <div className="conditions-tabs" role="tablist" aria-label="Condition sections">
          {MEDICAL_HISTORY_GROUPS.map((group, index) => {
            const selectedCount = group.options.filter((option) => selected.includes(option)).length;
            const isActive = index === activeGroupIndex;
            return (
              <button
                type="button"
                key={group.title}
                role="tab"
                aria-selected={isActive}
                className={`conditions-tab ${isActive ? 'active' : ''}`}
                onClick={() => goToGroup(index)}
              >
                <span>{group.title}</span>
                <small>{selectedCount > 0 ? `${selectedCount} selected` : 'Tap to open'}</small>
              </button>
            );
          })}
        </div>
        <div className="condition-group-frame" style={{ maxHeight: contentHeight ? `${contentHeight}px` : undefined }}>
          <section className="condition-group" key={activeGroup.title} ref={contentRef}>
            <div className="condition-group-topbar">
              <h3>{activeGroup.title}</h3>
              <span className="field-helper">
                {activeGroup.options.filter((option) => selected.includes(option)).length} selected
              </span>
            </div>
            <div className="condition-grid">
              {activeGroup.options.map((option) => {
                const checked = selected.includes(option);
                return (
                  <label className={`condition-option ${checked ? 'selected' : ''}`} key={option}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(option)} />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
            <div className="condition-group-nav">
              <button
                type="button"
                className="condition-nav-btn secondary-btn"
                onClick={() => goToGroup(activeGroupIndex - 1)}
                disabled={activeGroupIndex === 0}
              >
                <span aria-hidden="true">&lt;</span>
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="condition-nav-btn secondary-btn"
                onClick={() => goToGroup(activeGroupIndex + 1)}
                disabled={activeGroupIndex === MEDICAL_HISTORY_GROUPS.length - 1}
              >
                <span>Next</span>
                <span aria-hidden="true">&gt;</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
