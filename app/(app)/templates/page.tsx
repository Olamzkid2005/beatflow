"use client";
import dynamic from 'next/dynamic';
const TemplateStudio=dynamic(()=>import('@/components/template-studio'),{ssr:false,loading:()=> <p className="p-8">Loading Template Studio…</p>});
export default function TemplatesPage(){return <TemplateStudio/>;}
