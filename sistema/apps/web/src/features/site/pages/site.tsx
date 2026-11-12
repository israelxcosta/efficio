import { useEffect, useState } from 'react';
import { ContactSection } from '../components/contact-section';
import { FaqBands } from '../components/faq-bands';
import { MonthShowcase } from '../components/month-showcase';
import { PortalSection } from '../components/portal-section';
import { ServicesIndex } from '../components/services-index';
import { SiteFooter } from '../components/site-footer';
import { SiteHero } from '../components/site-hero';
import { StartAccordion } from '../components/start-accordion';
import { goToSection, SectionLink, useReveal } from '../components/site-ui';
import { OFFICE } from '../site-content';
import '../site.css';

/** The office's public site: `/` for visitors who are not signed in, and `/site` for everyone. */
export default function SitePage() {
  const root = useReveal<HTMLDivElement>();
  const [subject, setSubject] = useState('');

  useEffect(() => {
    const previous = document.title;
    document.title = `${OFFICE.name} · escritório de contabilidade`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div ref={root} className="site">
      <SectionLink to="mes" className="site-skip">
        Pular para o conteúdo
      </SectionLink>
      <SiteHero />
      <main>
        <MonthShowcase />
        <ServicesIndex
          onPick={(service) => {
            setSubject(service.name);
            goToSection('contato');
          }}
        />
        <PortalSection />
        <StartAccordion />
        <FaqBands />
        <ContactSection subject={subject} onSubjectChange={setSubject} />
      </main>
      <SiteFooter />
    </div>
  );
}
