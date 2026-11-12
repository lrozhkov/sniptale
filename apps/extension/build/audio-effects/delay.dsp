import("stdfaust.lib"); duration=hslider("duration[unit:s]",0.25,0.01,1,0.001); feedback=hslider("feedback",0.3,0,0.85,0.01); process=par(i,2,ef.echo(1,duration,feedback));
