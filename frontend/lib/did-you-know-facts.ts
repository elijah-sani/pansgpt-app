export interface DidYouKnowFact {
    id: string;
    emoji: string;
    title: string;
    fact: string;
}

export const DID_YOU_KNOW_FACTS: DidYouKnowFact[] = [
    { id: "drug-discovery", emoji: "💊", title: "Drug Discovery", fact: "On average, it takes about 10-15 years and over $1 billion to develop a new drug from discovery to market approval." },
    { id: "dna-drugs", emoji: "🧬", title: "DNA & Drugs", fact: "Pharmacogenomics studies how your genes affect your response to drugs, potentially enabling personalized medicine." },
    { id: "natural-origins", emoji: "🌿", title: "Natural Origins", fact: "About 40% of all medicines in use today are derived from or inspired by natural sources like plants, fungi, and bacteria." },
    { id: "vaccines", emoji: "💉", title: "Vaccines", fact: "The word 'vaccine' comes from 'vacca', Latin for cow, because the first vaccine was developed from cowpox." },
    { id: "aspirin", emoji: "🔬", title: "Aspirin", fact: "Aspirin (acetylsalicylic acid) was first synthesized in 1897 and remains one of the most widely used medications worldwide." },
    { id: "clinical-trials", emoji: "📊", title: "Clinical Trials", fact: "Only about 12% of drugs that enter clinical trials eventually receive FDA approval." },
    { id: "penicillin", emoji: "🧪", title: "Penicillin", fact: "Alexander Fleming discovered penicillin by accident in 1928 when mold contaminated one of his bacterial cultures." },
    { id: "ph-balance", emoji: "⚗️", title: "pH Balance", fact: "The pH of your stomach acid is around 1.5-3.5, which is strong enough to dissolve metal but the stomach lining protects itself." },
];
