import React from "react"
import Layout from "@/layout/layout"
import { Button } from "@/components/ui/button"
import SimpleCard from "@/components/test/SimpleCard"

const App = () => {
  return (
    <Layout>
      <div className="h-full flex justify-center">
        <SimpleCard className="flex-1" />
      </div>
    </Layout>
  )
}

export default App;
