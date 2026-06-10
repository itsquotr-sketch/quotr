"use client";



import { useActionState, useState } from "react";

import { Loader2 } from "lucide-react";

import { createProject } from "@/actions/projects";

import type { ProjectActionState } from "@/lib/validations/project";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select";

import {

  ENQUIRY_SOURCES,

  PROJECT_PRIORITIES,

} from "@/lib/constants/projects";



const initialState: ProjectActionState = {};



export function NewProjectForm() {

  const [state, formAction, pending] = useActionState(

    createProject,

    initialState

  );

  const [enquirySource, setEnquirySource] = useState("");

  const [priority, setPriority] = useState("normal");



  return (

    <form action={formAction} className="space-y-6">

      <input type="hidden" name="enquirySource" value={enquirySource} />

      <input type="hidden" name="priority" value={priority} />



      <section className="space-y-4">

        <p className="text-sm text-muted-foreground">

          Add the basics here. You will enter job notes in Project Assistant

          after the project is created.

        </p>



        <div className="space-y-2">

          <Label htmlFor="title">Project title</Label>

          <Input

            id="title"

            name="title"

            placeholder="e.g. Smith residence renovation"

            required

          />

          {state.fieldErrors?.title && (

            <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>

          )}

        </div>



        <div className="space-y-2">

          <Label htmlFor="clientName">Client name</Label>

          <Input id="clientName" name="clientName" required />

          {state.fieldErrors?.clientName && (

            <p className="text-sm text-destructive">

              {state.fieldErrors.clientName[0]}

            </p>

          )}

        </div>



        <div className="grid gap-4 sm:grid-cols-2">

          <div className="space-y-2">

            <Label htmlFor="clientPhone">Client phone</Label>

            <Input id="clientPhone" name="clientPhone" type="tel" />

          </div>

          <div className="space-y-2">

            <Label htmlFor="clientEmail">Client email</Label>

            <Input id="clientEmail" name="clientEmail" type="email" />

            {state.fieldErrors?.clientEmail && (

              <p className="text-sm text-destructive">

                {state.fieldErrors.clientEmail[0]}

              </p>

            )}

          </div>

        </div>



        <div className="space-y-2">

          <Label htmlFor="siteAddress">Site address</Label>

          <Input id="siteAddress" name="siteAddress" required />

          {state.fieldErrors?.siteAddress && (

            <p className="text-sm text-destructive">

              {state.fieldErrors.siteAddress[0]}

            </p>

          )}

        </div>



        <div className="space-y-2">

          <Label>Enquiry source</Label>

          <Select value={enquirySource} onValueChange={setEnquirySource} required>

            <SelectTrigger>

              <SelectValue placeholder="How did this enquiry come in?" />

            </SelectTrigger>

            <SelectContent>

              {ENQUIRY_SOURCES.map((source) => (

                <SelectItem key={source.value} value={source.value}>

                  {source.label}

                </SelectItem>

              ))}

            </SelectContent>

          </Select>

          {state.fieldErrors?.enquirySource && (

            <p className="text-sm text-destructive">

              {state.fieldErrors.enquirySource[0]}

            </p>

          )}

        </div>



        <div className="space-y-2">

          <Label>Priority</Label>

          <Select value={priority} onValueChange={setPriority}>

            <SelectTrigger>

              <SelectValue />

            </SelectTrigger>

            <SelectContent>

              {PROJECT_PRIORITIES.map((p) => (

                <SelectItem key={p.value} value={p.value}>

                  {p.label}

                </SelectItem>

              ))}

            </SelectContent>

          </Select>

        </div>

      </section>



      {state.error && (

        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">

          {state.error}

        </p>

      )}



      <Button type="submit" className="w-full" size="lg" disabled={pending}>

        {pending ? (

          <>

            <Loader2 className="mr-2 h-4 w-4 animate-spin" />

            Creating project…

          </>

        ) : (

          "Create project"

        )}

      </Button>

    </form>

  );

}

