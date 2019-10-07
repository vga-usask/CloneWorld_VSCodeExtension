const vscode = acquireVsCodeApi();

let cloneReport;
let searchingFilePath;
let searchingLineNumber;
let brushedData = [];
let isIgnoringUnchangedClones = d3.select('#ignore-unchanged-clone-input').node().checked;

function refresh() {
    vscode.postMessage({
        command: 'refresh'
    });
}

function generateVisualizations() {
    let changeCountData = generateChangeCountData();
    if (searchingFilePath && searchingLineNumber) {
        var queriedClone = Object.values(cloneReport.cloneDictionary[cloneReport.info.maxRevision][searchingFilePath]).find(d => d.start_line <= searchingLineNumber && d.end_line >= searchingLineNumber);
        changeCountData = changeCountData.filter(getSameClassClonesFilter(queriedClone));
    }
    changeCountData = changeCountData.filter(getCloneInLastRevisionFilter());
    if (isIgnoringUnchangedClones) {
        changeCountData = changeCountData.filter(getOnlyChangedCloneFilter());
    }
    generateParallelCoordinate(changeCountData);
    generateParallelCoordinate2(changeCountData);
    generateHeatmap(changeCountData);

    saveState();
}

function generateParallelCoordinate(changeCountData) {
    d3.selectAll('#pc-container').selectAll('*').remove();
    const pc = ParCoords()('#pc-container')
        .margin({
            top: 20,
            left: 20,
            right: 20,
            bottom: 20
        })
        .mode('queue')
        .alpha(.3)
        .color('blue')
        .alphaOnBrushed(.35)
        .brushedColor('red')
        .on('brush', getParallelCoordinateBrushHandler());

    const dimensions = generateDimensions(pc, cloneReport.info.minRevision, cloneReport.info.maxRevision, changeCountData);


    vscode.postMessage({
        command: 'aaaaa'
    });

    pc
        .data(changeCountData)
        .dimensions(dimensions)
        .render()
        .createAxes()
        .reorderable()
        .brushMode('1D-axes-multi');
}

function generateParallelCoordinate2(changeCountData) {
    d3.selectAll('#pc-container-2').selectAll('*').remove();
    const pc = ParCoords()('#pc-container-2')
        .margin({
            top: 20,
            left: 20,
            right: 20,
            bottom: 20
        })
        .mode('queue')
        .alpha(.3)
        .color('blue')
        .alphaOnBrushed(.35)
        .brushedColor('red')
    // .on('brush', getParallelCoordinateBrushHandler());

    let classIdData = [];
    for (const changeCountDatum of changeCountData) {
        let temp = {};
        for (const key of Object.keys(changeCountDatum)) {
            if (key == 'id') {
                temp[key] = changeCountDatum[key];
            } else {
                const clone = cloneReport.globalIdDictionary[changeCountDatum.id][key];
                temp[key] = clone ? clone.class_id : Number.NEGATIVE_INFINITY;
            }
        }
        classIdData.push(temp);
    }

    const dimensions = generateDimensions2(pc, cloneReport.info.minRevision, cloneReport.info.maxRevision, classIdData, changeCountData);

    pc
        .data(classIdData)
        .dimensions(dimensions)
        .render()
        .createAxes()
        .reorderable()
        .brushMode('1D-axes-multi');
}

function generateHeatmap(changeCountData) {
    let cloneClassDictionary = {};
    for (const clone of changeCountData) {
        let classId = cloneReport.globalIdDictionary[clone.id][cloneReport.info.maxRevision].class_id;
        if (!cloneClassDictionary[classId]) {
            cloneClassDictionary[classId] = [];
        }
        cloneClassDictionary[classId].push(clone);
    }

    let pairs = [];
    for (const clone of changeCountData) {
        for (const classId of Object.keys(cloneClassDictionary)) {
            let cochangeCount = 0;
            for (const cloneInClass of cloneClassDictionary[classId]) {
                cochangeCount += Object.keys(clone)
                    .map((k) => (clone[k] > 0 && cloneInClass[k] > 0) ? 1 : 0)
                    .filter(d => d > 0)
                    .length;
            }
            pairs.push({
                clone,
                classId,
                cochangeCount
            });
        }
    }

    const width = 500;
    const height = 150;

    d3.selectAll('#hm-container').selectAll('*').remove();
    var svg = d3.select('#hm-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Build X scales and axis:
    var x = d3.scaleBand()
        .range([0, width])
        .domain(changeCountData.map(d => d.id).sort((a, b) => +getCloneClassId(a) - +getCloneClassId(b)))
        .padding(0.01);
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    // Build Y scales and axis:
    var y = d3.scaleBand()
        .range([height, 0])
        .domain(Object.keys(cloneClassDictionary).sort((a, b) => +b - +a))
        .padding(0.01);
    svg.append("g")
        .call(d3.axisLeft(y));

    // Build color scale
    var myColor = d3.scaleLinear()
        .range(["white", "blue"])
        .domain([0, d3.max(pairs.map(d => d.cochangeCount))]);

    let rects = svg.selectAll()
        .data(pairs)
        .enter()
        .append("rect")
        .attr("x", d => x(d.clone.id))
        .attr("y", d => y(d.classId))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => myColor(d.cochangeCount));
    rects.append("title")
        .text(d => d.classId + ", " + d.clone.id + "(" + getCloneClassId(d.clone.id) + ")" + " -> " + d.cochangeCount);
}

function generateChangeCountData() {
    const data = [];
    const globalIdList = Array.from(Object.keys(cloneReport.globalIdDictionary)).sort((a, b) => {
        const cloneA = cloneReport.globalIdDictionary[a];
        const cloneACount = Array.from(Object.values(cloneA)).reduce((x, y) => +x | 0 + +y.addition_count + +y.deletion_count);
        const cloneB = cloneReport.globalIdDictionary[b];
        const cloneBCount = Array.from(Object.values(cloneB)).reduce((x, y) => +x | 0 + +y.addition_count + +y.deletion_count);
        return cloneBCount - cloneACount;
    })

    for (const globalId of globalIdList.splice(0, 100)) {
        const revisionsNode = cloneReport.globalIdDictionary[globalId];
        const temp = {};

        for (let i = cloneReport.info.minRevision; i <= cloneReport.info.maxRevision; i++) {
            // let addtionCount = revisionsNode[i] ? revisionsNode[i].addition_count : Number.NEGATIVE_INFINITY;
            // let deletionCount = revisionsNode[i] ? revisionsNode[i].deletion_count : Number.NEGATIVE_INFINITY;
            // if (addtionCount > 0 && deletionCount > 0) {
            //     temp[i] = 3;
            // } else if (addtionCount > 0) {
            //     temp[i] = 2;
            // } else if (deletionCount > 0) {
            //     temp[i] = 1;
            // } else if (addtionCount == 0 && deletionCount == 0) {
            //     temp[i] = 0;
            // } else {
            //     temp[i] = Number.NEGATIVE_INFINITY;
            // }
            temp[i + 'a'] = revisionsNode[i] ? revisionsNode[i].addition_count : Number.NEGATIVE_INFINITY;
            temp[i + 'd'] = revisionsNode[i] ? revisionsNode[i].deletion_count : Number.NEGATIVE_INFINITY;
        }
        temp.id = globalId.toString();
        data.push(temp);
    }

    return data;
}

function generateDimensions(pc, minRevision, maxRevision, data) {
    const dimensions = {};
    const range = pc.height() - pc.margin().top - pc.margin().bottom;
    const max = d3.max(data, d => d3.max(Object.keys(d), k => k == 'id' ? 0 : d[k]));
    const scale = d3.scaleSqrt().domain([0, max]).range([range, 1]);

    for (let i = minRevision; i <= maxRevision; i++) {
        if (checkIfThisRevisionHasChangedClones(i, data) || i == maxRevision) {
            dimensions[i + 'a'] = {
                type: 'number',
                yscale: scale,
                ticks: 0
            };
            dimensions[i + 'd'] = {
                type: 'number',
                yscale: scale,
                ticks: 0
            };
        }
    }

    // dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].ticks = 5;
    // dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].orient = 'left';
    // dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].ticks = 5;
    // dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].orient = 'right';
    dimensions.id = {
        type: 'string',
        ticks: 0,
        tickValues: []
    };

    return dimensions;
}

function generateDimensions2(pc, minRevision, maxRevision, classIdData, changeCountData) {
    const dimensions = {};
    const range = pc.height() - pc.margin().top - pc.margin().bottom;
    const classIdList = [];
    for (const datum of classIdData) {
        for (const k of Object.keys(datum).filter(d => d != 'id').filter(d => datum[d] != Number.NEGATIVE_INFINITY)) {
            if (!classIdList.find(d => d == datum[k])) {
                classIdList.push(datum[k]);
            }
        }
    }
    const scale = d3.scaleBand().domain(classIdList.sort((a, b) => +a - +b)).range([range, 1]);

    for (let i = minRevision; i <= maxRevision; i++) {
        if (checkIfThisRevisionHasChangedClones(i, changeCountData) || i == maxRevision) {
            dimensions[i] = {
                type: 'string',
                yscale: scale,
                tickValues: []
            };
        }
    }

    dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].tickValues = undefined;
    dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].orient = 'left';
    dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].tickValues = undefined;
    dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].orient = 'right';
    dimensions.id = {
        type: 'string',
        ticks: 0,
        tickValues: []
    };

    return dimensions;
}


function getSameClassClonesFilter(queriedClone) {
    return d => {
        const clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
        return queriedClone && clone && clone.class_id === queriedClone.class_id;
    };
}

function getCloneInLastRevisionFilter() {
    return d => d[cloneReport.info.maxRevision + 'a'] >= 0 || d[cloneReport.info.maxRevision + 'd'] >= 0;
}

function getOnlyChangedCloneFilter() {
    return d => {
        for (let i = 0; i <= cloneReport.info.maxRevision; i++) {
            if (d[i + 'a'] > 0 || d[i + 'd'] > 0) {
                return true;
            }
        }
        return false;
    }
}

function checkIfThisRevisionHasChangedClones(revisionId, data) {
    for (const datum of data) {
        if (datum[revisionId + 'a'] > 0 || (datum[revisionId + 'a'] == 0 && revisionId >= 0 && datum[(revisionId - 1) + 'a'] < 0)) {
            return true;
        }
        if (datum[revisionId + 'd'] > 0 || (datum[revisionId + 'd'] == 0 && revisionId >= 0 && datum[(revisionId - 1) + 'd'] < 0)) {
            return true;
        }
    }
    return false;
}

function getCloneClassId(cloneGlobalId) {
    return cloneReport.globalIdDictionary[cloneGlobalId][cloneReport.info.maxRevision].class_id;
}

function getParallelCoordinateBrushHandler() {
    return d => {
        brushedData = d;
        d3.selectAll('#clone-picker-list').selectAll('*').remove();
        let li = d3.select('#clone-picker-list')
            .selectAll('li')
            .data(brushedData)
            .enter()
            .append('li');
        li.append('a')
            .attr('href', '#')
            .text(d => {
                let clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
                return d.id + ' > ' + clone.file + ' : ' + clone.start_line + ' ~ ' + clone.end_line;
            })
            .on('click', d => {
                let clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
                vscode.postMessage({
                    command: 'open-clone',
                    id: d.id,
                    file: clone.file,
                    start_line: clone.start_line,
                    end_line: clone.end_line
                });
            });

        saveState();
    };
}

function isIgnoringUnchangedClonesInputChangeHandler() {
    isIgnoringUnchangedClones = d3.select('#ignore-unchanged-clone-input').node().checked;
    generateVisualizations();
}

function resetData() {
    searchingFilePath = undefined;
    searchingLineNumber = undefined;
    generateVisualizations();
    getParallelCoordinateBrushHandler()([]);

    saveState();
}

function saveState() {
    vscode.setState({
        cloneReport,
        searchingFilePath,
        searchingLineNumber,
        brushedData,
        isIgnoringUnchangedClones
    });
}

window.addEventListener('message', event => {
    if (event.data.cloneReport) {
        cloneReport = event.data.cloneReport;
    }

    searchingFilePath = event.data.filePath;
    searchingLineNumber = event.data.lineNumber;

    generateVisualizations();
});

const previousState = vscode.getState();
if (previousState) {
    cloneReport = previousState.cloneReport;
    searchingFilePath = previousState.searchingFilePath;
    searchingLineNumber = previousState.searchingLineNumber;
    brushedData = previousState.brushedData;
    isIgnoringUnchangedClones = previousState.isIgnoringUnchangedClones;

    generateVisualizations();
    getParallelCoordinateBrushHandler()(brushedData);
} else {
    refresh();
}