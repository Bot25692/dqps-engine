import type { Metadata } from 'next';
import { Inter, Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { WorkspaceShell } from '@/components/manus/shell/WorkspaceShell';
import { DatasetSelector } from '@/components/dataset-selector';
const inter=Inter({subsets:['latin'],variable:'--font-inter',display:'swap'});
const manrope=Manrope({subsets:['latin'],variable:'--font-manrope',display:'swap'});
const mono=IBM_Plex_Mono({subsets:['latin'],weight:['400','500','600'],variable:'--font-ibm',display:'swap'});
export const metadata:Metadata={title:'A.D.A.P.T. — Decision Intelligence',description:'Advertising Decision Automation for Profitable Targeting.'};
// Keep dataset selection owned by the existing host; Manus supplies only the visual shell.
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={`${inter.variable} ${manrope.variable} ${mono.variable}`}><body><WorkspaceShell headerActions={<DatasetSelector/>}>{children}</WorkspaceShell></body></html>;}
