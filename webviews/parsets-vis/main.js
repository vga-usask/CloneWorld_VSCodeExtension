const vscode = acquireVsCodeApi();

let cloneReport;

function refresh() {
    vscode.postMessage({
        command: 'refresh'
    });
}

window.addEventListener('message', event => {
    if (event.data.cloneReport) {
        cloneReport = event.data.cloneReport;
    }

    generateVisualization();
});

function generateVisualization() {
    d3.select("#vis").selectAll("*").remove();
    d3.select(".parsets").selectAll("*").remove();

    vscode.postMessage({
        command: 'alert',
        content: "starting to processing data..."
    });

    const dimensions = ["Size", "Type", "Frequency", "Consistency"];
    dimensions.push("Class");
    // for (let i = cloneReport.info.maxRevision; i > cloneReport.info.minRevision; i--) {
    //     dimensions.push("Class_v" + i);
    // }

    let chart = d3.parsets()
        .dimensions(dimensions)
        .height(dimensions.length * 100);

    let vis = d3.select("#vis").append("svg")
        .attr("width", chart.width())
        .attr("height", chart.height());

    let data = Object.values(cloneReport.globalIdDictionary)
        .filter(globalClone => globalClone[cloneReport.info.maxRevision])
        .map(globalClone => {
            const cloneInLastRevision = globalClone[cloneReport.info.maxRevision];
            const consistency = 0;

            const startRevision = Math.min(...Object.keys(globalClone));
            const cloneAtStartRevision = globalClone[startRevision];
            const siblings = [];
            Object.values(cloneReport.cloneDictionary[startRevision]).forEach(file => Object.values(file).forEach(clone => {
                if (clone.class_id == cloneAtStartRevision.class_id && clone.pcid != cloneAtStartRevision.pcid) {
                    siblings.push(clone);
                }
            }))
            // for (const clone of Object.values(cloneReport.cloneDictionary[startRevision])) {
            //     if (clone.class_id == cloneAtStartRevision.class_id && clone.id != cloneAtStartRevision.id) {
            //         siblings.push(clone);
            //     }
            // }

            let hasChangedClass = false;
            for (let i = startRevision; i <= cloneReport.info.maxRevision; i++) {
                const classId = globalClone[i].class_id;
                let cloneInSameClassCount = 1;
                let aliveCloneCount = 1;
                siblings.forEach(sibling => {
                    if (sibling.class_id > 0) {
                        aliveCloneCount++;
                    }
                    if (sibling.class_id == classId) {
                        cloneInSameClassCount++;
                    }
                })

                // TODO optimize the threshold
                if (cloneInSameClassCount / aliveCloneCount < .5) {
                    hasChangedClass = true;
                    break;
                }
            }


            const result = {
                Size: cloneInLastRevision.end_line - cloneInLastRevision.start_line,
                Type: 3,
                Frequency: Object.values(globalClone).reduce((prev, curr) => prev + ((curr.addition_count > 0 || curr.deletion_count > 0) ? 1 : 0), 0),
                AdditionCount: d3.sum(Object.values(globalClone).map(d => d.addition_count)),
                DelitionCount: d3.sum(Object.values(globalClone).map(d => d.deletion_count)),
                FileCount: new Set(Object.values(globalClone).map(d => d.file)).size,
                Consistency: hasChangedClass ? 'Changed' : 'Unchanged',
                Class: globalClone[cloneReport.info.maxRevision].class_id,
                cloneInLastRevision
            };

            // for (let i = cloneReport.info.maxRevision; i > cloneReport.info.minRevision; i--) {
            //     result["Class_v" + i] = globalClone[i] ? globalClone[i].class_id : -1;
            // }

            return result;
        });

    console.log(JSON.stringify(data));

    let sizeScale = d3.scaleQuantile()
        .domain(data.map(globalClone => globalClone.Size))
        .range([1, 2, 3, 4]);
    data.forEach(globalClone => globalClone.Size = sizeScale(globalClone.Size));

    // let frequencyScale = d3.scaleQuantile()
    //     .domain(data.map(globalClone => globalClone.Frequency))
    //     .range([1, 2, 3, 4]);
    // data.forEach(globalClone => globalClone.Frequency = frequencyScale(globalClone.Frequency));

    vscode.postMessage({
        command: 'alert',
        content: "starting to drawing vis..."
    });

    vis.datum(data).call(chart);

    vis
        .select('g.ribbon-mouse')
        .selectAll('path')
        .style('cursor', 'pointer')
        .on('click', d => {
            let filteredData = data;
            for (let node = d; node.parent; node = node.parent) {
                filteredData = filteredData.filter(dt => dt[node.dimension] == node.name);
            }
            filteredData.forEach(dt => d3.select("#vis").append('p').text(dt.cloneInLastRevision.pcid));
        });
}

refresh();