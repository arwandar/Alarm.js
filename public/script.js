function getSingleAlarmsList() {
    $("#singleAlarmsList").load("/singleAlarmsList");
}

function getRepetitiveAlarmsList() {
    $("#repetitiveAlarmsList").load("/repetitiveAlarmsList");
}

function addNewSingle() {
    $.post("/single", $('#singleAlarmForm').serialize()).done(function() {
        $('#singleAlarmForm')[0].reset();
        getSingleAlarmsList();
    })
}

function addNewRepetitive() {
    $.post("/repetitive", $('#repetitiveAlarmForm').serialize()).done(function() {
        $('#repetitiveAlarmForm')[0].reset();
        getRepetitiveAlarmsList();
    })
}

function editSingle(id) {
    $('#singleAlarmForm').find('[name="modal-id"]').val(id);
    $('#singleAlarmForm').find('[name="modal-name"]').val($('[data-single-name-' + id + ']').text());
    $('#singleAlarmForm').find('[name="modal-date"]').val($('[data-single-date-' + id + ']').attr('data-single-date-' + id).split('T')[0]);
    $('#singleAlarmForm').find('[name="modal-time"]').val($('[data-single-date-' + id + ']').attr('data-single-date-' + id).split('T')[1].slice(0, -1));
}

function editRepetitive(id) {
    $('#repetitiveAlarmForm').find('[name="modal-id"]').val(id);
    $('#repetitiveAlarmForm').find('[name="modal-name"]').val($('[data-repetitive-name-' + id + ']').text());
    $('#repetitiveAlarmForm').find('[name="modal-time"]').val($('[data-repetitive-time-' + id + ']').text());
    for (let i = 0; i < 7; i++) {
        if ($('[data-repetitive-day-' + id + '-' + i + ']').is(":checked")) {
            $('#repetitiveAlarmForm').find('[name="modal-day-' + i + '"]').attr('checked', 'checked')
        }
    }
}

function removeSingle(id) {
    $.ajax({
        url: '/singles/' + id,
        type: 'DELETE'
    }).done(function(data) {
        getSingleAlarmsList();
    });
};

function removeRepetitive(id) {
    $.ajax({
        url: '/repetitives/' + id,
        type: 'DELETE'
    }).done(function(data) {
        getRepetitiveAlarmsList();
    });
};

$(document).ready(function() {
    getSingleAlarmsList();
    getRepetitiveAlarmsList();
});
