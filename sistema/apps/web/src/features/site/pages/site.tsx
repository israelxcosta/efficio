import { useEffect, useState } from 'react';
import '@fontsource-variable/geist';
import { AudienceCards } from '../components/audience-cards';
import { CompareTable } from '../components/compare-table';
import { ContactSection } from '../components/contact-section';
import { DueNumbers } from '../components/due-numbers';
import { FaqSection } from '../components/faq-section';
import { MonthShowcase } from '../components/month-showcase';
import { ServicesOrbit } from '../components/services-orbit';
import { AnnouncementBar, SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { SiteHero } from '../components/site-hero';
import { goToSection, SectionLink, useReveal } from '../components/site-ui';
import { StartJourney } from '../components/start-journey';
import { WhyBento } from '../components/why-bento';
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
    <div ref={root} className="site" id="topo">
      <SectionLink to="conteudo" className="site-skip">
        Pular para o conteúdo
      </SectionLink>
      <AnnouncementBar />
      <SiteHeader />
      <main id="conteudo">
        <SiteHero />
        <DueNumbers />
        <StartJourney />
        <MonthShowcase />
        <ServicesOrbit
          onPick={(service) => {
            setSubject(service.name);
            goToSection('contato');
          }}
        />
        <WhyBento />
        <CompareTable />
        <AudienceCards />
        <FaqSection />
        <ContactSection subject={subject} onSubjectChange={setSubject} />
      </main>
      <SiteFooter />
    </div>
  );
}
