import("stdfaust.lib"); feedback=hslider("feedback",0.7,0,0.95,0.01); damping=hslider("damping",0.3,0,1,0.01); process=re.stereo_freeverb(feedback,0.5,damping,23);
